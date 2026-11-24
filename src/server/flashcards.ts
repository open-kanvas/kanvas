import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {ViewSpec} from '../shared/types.js';
import {flashcardDataSchema,flashcardReadSchema,flashcardControlSchema,flashcardShowSchema,advanceFlashcards} from '../shared/flashcards.js';
import {AppError,id,now,required} from './store.js';
import {hash} from './auth.js';
import {displayedLeaf,replaceLeaf} from './engagement.js';
import type {Definition} from './mcp/canonical.js';
export const flashcardTools: Definition[] = [
    {
        name: "kanvas.flashcards.read", summary: "Read saved decks, current cards, and revisions when preparing to resume or control a flashcard session.", readOnly: true, schema: flashcardReadSchema, description: 'Read saved session decks or one deck/current card and revisions. Large decks return card windows with nextOffset. Voice: ask current prompt, then control answer with cardId and both revisions. Answers are reference data, not semantic grading.',
        domain: "flashcards",
        requiredScope: "read",
        discovery: {"group":"content","hint":"Read saved deck and current card for voice learning or self-testing.","examples":[{"sessionId":"session-id","deckId":"deck-id"}]},
        searchAliases: ["kanvas.flashcards.read"]
    },
    {
        name: "kanvas.flashcards.control", summary: "Reveal, navigate, answer, or restart a displayed deck when conducting a flashcard exercise with recorded responses.", schema: flashcardControlSchema, idempotent: true, description: 'Control displayed deck: reveal/next/previous/answer/restart. Answer records spoken/typed response for current cardId. exact matches normalized answer/acceptedAnswers, NOT semantics; self needs explicit correct; none is ungraded. Answer reveals, next advances. Supply a stable requestId for safe retries. expectedRevision and expectedDeckRevision are independent optional stale-write guards. Include current cardId even for restart; restart resets the deck and may set mode, ignoring the card identity comparison.',
        domain: "flashcards",
        requiredScope: "publish",
        discovery: {"group": "controls", "hint": "Submit spoken/typed answer for the current card with deck and display revisions. Exact matching is not semantic grading.", "examples": [{"sessionId": "session-id", "displayId": "display-id", "deckId": "deck-id", "expectedRevision": 1, "expectedDeckRevision": 0, "requestId": "answer-1", "cardId": "hola", "action": "answer", "response": "hello", "grading": "exact"}, {"sessionId": "session-id", "displayId": "display-id", "deckId": "deck-id", "cardId": "hola", "action": "restart", "requestId": "restart-1"}]},
        searchAliases: ["kanvas.flashcards.control"]
    },
    {
        name: "kanvas.flashcards.show", summary: "Restore a saved deck on a display in its session when resuming flashcards after other content.", schema: flashcardShowSchema, idempotent: true, description: 'Restore latest deck on a same-session display at expectedRevision. Publishing flashcards auto-saves a deck; display replacement never erases it.',
        domain: "flashcards",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Restore a saved deck after other content replaced it.","examples":[{"sessionId":"session-id","displayId":"display-id","deckId":"deck-id","expectedRevision":1,"requestId":"show-1"}]},
        searchAliases: ["kanvas.flashcards.show"]
    }
];
const stable=(v:unknown):string=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
interface Deck{id:string;sessionId:string;view:ViewSpec;revision:number;updatedAt:string}
export class Flashcards{
 constructor(private service:KanvasService){}
 private get store(){return this.service.store;}
 async capture(sessionId:string,input:ViewSpec){
  if(input.template!=='flashcards')return input;
  const data=flashcardDataSchema.parse(input.data),previous=data.deckId?await this.store.get<Deck>('flashcards',data.deckId):undefined;
  if(data.deckId&&(!previous||previous.sessionId!==sessionId))throw new AppError('NOT_FOUND','Deck unavailable.',404);
  if(previous&&stable(previous.view)===stable({...input,data}))return structuredClone(previous.view);
  if(previous)this.service.assertRevision(data.deckRevision,previous.revision);
  else if((await this.store.list('flashcards',sessionId)).length>=100)throw new AppError('LIMIT_REACHED','At most 100 saved decks per session.',429);
  const key=previous?.id??id(),revision=previous?previous.revision+1:0;
  const view={...input,data:{...data,deckId:key,deckRevision:revision}};
  await this.store.put('flashcards',{id:key,sessionId,view,revision,updatedAt:now()});return view;
 }
 private projected(deck:Deck,offset=0,limit=100):unknown{
  if(offset===0&&limit>=100&&Buffer.byteLength(JSON.stringify(deck))<44000)return deck;
  const data=flashcardDataSchema.parse(deck.view.data);let cards=data.cards.slice(offset,offset+limit);
  while(cards.length>1&&Buffer.byteLength(JSON.stringify(cards))>28000)cards=cards.slice(0,Math.ceil(cards.length/2));
  const current=data.cards[data.index];return {id:deck.id,sessionId:deck.sessionId,revision:deck.revision,title:deck.view.title,mode:data.mode,index:data.index,revealed:data.revealed,currentCard:current,currentResponse:data.responses.find(r=>r.cardId===current.id),answered:data.responses.length,cards,total:data.cards.length,offset,...(offset+cards.length<data.cards.length?{nextOffset:offset+cards.length}:{}),note:'Bounded card window; show restores the complete saved deck.'};
 }
 private async get(sessionId:string,key:string){const d=required(await this.store.get<Deck>('flashcards',key));if(d.sessionId!==sessionId)throw new AppError('NOT_FOUND','Deck unavailable.',404);return d;}
 async read(p:AuthPrincipal,raw:unknown){const a=flashcardReadSchema.parse(raw);await this.service.fullAccount(p);await this.service.access(p,a.sessionId);if(a.deckId)return this.projected(await this.get(a.sessionId,a.deckId),a.offset,a.limit);return {decks:(await this.store.list<Deck>('flashcards',a.sessionId)).map(d=>({id:d.id,title:d.view.title,revision:d.revision,updatedAt:d.updatedAt}))};}
 async control(p:AuthPrincipal,raw:unknown){const a=flashcardControlSchema.parse(raw);return this.store.atomic(async()=>this.store.transaction(async()=>{
  await this.service.fullAccount(p,'publish');const display=await this.service.display(p,a.sessionId,a.displayId,'editor');
  const key=hash(p.userId+':'+(p.tokenId??'')+':'+a.sessionId+':'+a.requestId),digest=hash(JSON.stringify(a));
  const prior=await this.store.get<{digest:string;result:unknown}>('flashcard-request',key);
  if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Request ID already used.',409);return prior.result;}
  this.service.assertRevision(a.expectedRevision,display.revision);
  const leaf=displayedLeaf(display.view);
  if(leaf?.template!=='flashcards'||leaf.data.deckId!==a.deckId)throw new AppError('CONFLICT','This deck is no longer displayed.',409);
  const deck=await this.get(a.sessionId,a.deckId);this.service.assertRevision(a.expectedDeckRevision,deck.revision);
  const data=flashcardDataSchema.parse(deck.view.data);
  if(a.action!=='restart'&&data.cards[data.index].id!==a.cardId)throw new AppError('CONFLICT','Current card changed; read the deck again.',409);
  const next=advanceFlashcards(data,a),update=await this.service.publishPreparedControl(p,a,replaceLeaf(display.view!,next));
  const result={deck:this.projected(await this.get(a.sessionId,a.deckId)),update};
  await this.store.put('flashcard-request',{id:key,sessionId:a.sessionId,digest,result});return result;
 }));}
 async show(p:AuthPrincipal,raw:unknown){const a=flashcardShowSchema.parse(raw);return this.store.atomic(async()=>this.store.transaction(async()=>{
  await this.service.fullAccount(p,'publish');await this.service.display(p,a.sessionId,a.displayId,'editor');
  const deck=await this.get(a.sessionId,a.deckId);return this.service.showChecklist(p,{...a,requestId:'fc-'+a.requestId},deck.view);
 }));}
}
