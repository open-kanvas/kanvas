import { z } from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const encodedBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const responseText=z.string().max(4000).refine(value=>encodedBytes(value)<=8000,'Response must fit 8000 encoded UTF-8 bytes.');
export const flashcardDataSchema=z.strictObject({
 deckId:id.optional(),deckRevision:z.number().int().nonnegative().optional(),
 mode:z.enum(['learn','test']).default('learn'),
 cards:z.array(z.strictObject({id,prompt:z.string().min(1).max(4000),answer:z.string().min(1).max(4000),acceptedAnswers:z.array(z.string().min(1).max(4000)).max(20).optional()}).refine(card=>encodedBytes(card)<=8000,'Each card must fit 8000 encoded UTF-8 bytes.')).min(1).max(100).refine(x=>new Set(x.map(c=>c.id)).size===x.length,'Card IDs must be unique'),
 index:z.number().int().nonnegative().default(0),revealed:z.boolean().default(false),
 responses:z.array(z.strictObject({cardId:id,response:responseText,result:z.enum(['correct','incorrect','ungraded']),grading:z.enum(['exact','self','none'])})).max(100).default([])
}).refine(d=>d.index<d.cards.length&&d.responses.every(r=>d.cards.some(c=>c.id===r.cardId))&&new Set(d.responses.map(r=>r.cardId)).size===d.responses.length,'Invalid current card or responses');
export type FlashcardData=z.infer<typeof flashcardDataSchema>;
export const flashcardReadSchema=z.strictObject({sessionId:id,deckId:id.optional(),offset:z.number().int().min(0).max(99).default(0),limit:z.number().int().min(1).max(100).default(100)});
export const flashcardControlSchema=z.strictObject({
 sessionId:id,deckId:id,displayId:id,expectedRevision:z.number().int().nonnegative(),expectedDeckRevision:z.number().int().nonnegative(),requestId:id,
 action:z.enum(['reveal','next','previous','answer','restart']),cardId:id,
 response:responseText.min(1).optional(),grading:z.enum(['exact','self','none']).default('exact'),correct:z.boolean().optional(),mode:z.enum(['learn','test']).optional()
}).refine(a=>a.action!=='answer'||(a.response!==undefined&&(a.grading!=='self'||a.correct!==undefined)),'Answer needs response and self grading needs correct');
export const flashcardShowSchema=z.strictObject({sessionId:id,deckId:id,displayId:id,expectedRevision:z.number().int().nonnegative(),requestId:id});
/** Exact matching is explicitly not semantic grading. */
export function advanceFlashcards(input:FlashcardData,a:z.infer<typeof flashcardControlSchema>):FlashcardData{
 const d=structuredClone(input),c=d.cards[d.index];
 if(c.id!==a.cardId)throw new Error('Current card changed; read again before answering.');
 if(a.action==='answer'){
  const normalize=(s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const correct=a.grading==='self'?a.correct:[c.answer,...c.acceptedAnswers??[]].some(x=>normalize(x)===normalize(a.response!));
  d.responses=d.responses.filter(r=>r.cardId!==c.id);
  d.responses.push({cardId:c.id,response:a.response!,grading:a.grading,result:a.grading==='none'?'ungraded':correct?'correct':'incorrect'});d.revealed=true;
 }else if(a.action==='reveal')d.revealed=true;
 else if(a.action==='next'||a.action==='previous'){d.index=Math.max(0,Math.min(d.cards.length-1,d.index+(a.action==='next'?1:-1)));d.revealed=false;}
 else {d.index=0;d.revealed=false;d.responses=[];if(a.mode)d.mode=a.mode;}
 return d;
}
