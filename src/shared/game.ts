import { z } from 'zod';

export const GAME_PRESETS = ['chess', 'poker', 'sudoku', 'tic-tac-toe', 'connect-four', 'checkers', 'backgammon', 'go', 'reversi', 'blackjack', 'solitaire', 'battleship', 'crossword', 'word-search', 'sliding-tile'] as const;
export type GamePreset = typeof GAME_PRESETS[number];
export const gamePresets: Record<GamePreset, { label: string; rows: number; columns: number; family: 'squares'|'cards'|'discs'|'intersections'|'points' }> = {
  checkers:{label:'Checkers',rows:8,columns:8,family:'squares'},
  backgammon:{label:'Backgammon',rows:2,columns:14,family:'points'},
  go:{label:'Go',rows:19,columns:19,family:'intersections'},
  reversi:{label:'Reversi / Othello',rows:8,columns:8,family:'squares'},
  blackjack:{label:'Blackjack',rows:0,columns:0,family:'cards'},
  solitaire:{label:'Solitaire',rows:0,columns:0,family:'cards'},
  battleship:{label:'Battleship',rows:10,columns:20,family:'squares'},
  crossword:{label:'Crossword',rows:10,columns:10,family:'squares'},
  'word-search':{label:'Word search',rows:10,columns:10,family:'squares'},
  'sliding-tile':{label:'Sliding-tile puzzle',rows:4,columns:4,family:'squares'},
  chess: { label: 'Chess', rows: 8, columns: 8, family: 'squares' },
  poker: { label: 'Texas Hold’em', rows: 0, columns: 0, family: 'cards' },
  sudoku: { label: 'Sudoku', rows: 9, columns: 9, family: 'squares' },
  'tic-tac-toe': { label: 'Tic-tac-toe', rows: 3, columns: 3, family: 'squares' },
  'connect-four': { label: 'Connect Four', rows: 6, columns: 7, family: 'discs' },
};
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v),'Reserved ID');
const text = z.string().max(200);
const emphasis = z.enum(['none','selected','last-move','warning']).default('none');
const color = z.union([z.enum(['white','black','red','yellow','blue','green']),z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional();
const cell = z.object({ value:text.optional(), notes:z.array(z.string().max(8)).max(12).optional(), given:z.boolean().optional(), blocked:z.boolean().optional(), number:z.number().int().min(1).max(999).optional(), emphasis }).strict();
const piece = z.object({ cell: id.describe('Internal rROWcCOLUMN (top-left r1c1), or visible A1-style coordinate. Chess/checkers/Go/reversi number rows bottom-up; other grids top-down.'), side:z.enum(['first','second']).optional().describe('Neutral opposing sides: first near-black, second near-white with outline. Explicit color overrides.'), symbol:z.enum(['king','queen','rook','bishop','knight','pawn','disc','X','O','tile']), color, stack:z.number().int().min(1).max(30).optional(), label:z.string().max(12).optional(), emphasis }).strict();
const card = z.discriminatedUnion('face',[
  z.object({ face:z.literal('up'), zone:id, order:z.number().int().min(0).max(100), rank:z.enum(['A','2','3','4','5','6','7','8','9','10','J','Q','K']), suit:z.enum(['clubs','diamonds','hearts','spades']), emphasis }).strict(),
  // An unknown back has NO retained identity. It is not a private card hidden by CSS.
  z.object({ face:z.literal('back'), zone:id, order:z.number().int().min(0).max(100), emphasis }).strict(),
]);
const bounded = <T extends z.ZodType>(schema:T, max:number) => z.record(id,schema).refine(v=>Object.keys(v).length<=max,`At most ${max} entries`);
export const gameDataSchema = z.object({
  preset:z.enum(GAME_PRESETS), visibility:z.literal('public').default('public').describe('All supplied state is visible to every authorized session reader. No private/recipient payloads; unknown card backs contain no identities.'),
  positionLabel:text.default('Live position'),showLabels:z.boolean().default(true),
  cells:bounded(cell,800).default({}), pieces:bounded(piece,400).default({}),
  zones:bounded(z.object({ label:text, badge:text.optional(), counter:text.optional(),bet:text.optional(),role:z.enum(['community','seat','dealer','player','stock','waste','foundation','tableau']).optional() }).strict(),32).default({}),
  cards:bounded(card,104).default({}), counters:bounded(z.object({ label:text, value:text,zone:id.optional() }).strict(),32).default({}),
  annotations:bounded(z.object({ text, cells:z.array(id).max(100).default([]) }).strict(),32).default({}),
}).strict().superRefine((data,ctx)=>{
  const preset=gamePresets[data.preset];
  const coordinate=(value:string)=>{const m=/^([A-Za-z])([1-9][0-9]*)$/.exec(value);if(!m)return value;const col=m[1].toUpperCase().charCodeAt(0)-64,row=['chess','checkers','go','reversi'].includes(data.preset)?preset.rows-Number(m[2])+1:Number(m[2]);return `r${row}c${col}`;};
  for(const key of Object.keys(data.cells)){const normalized=coordinate(key);if(normalized!==key){if(Object.hasOwn(data.cells,normalized))ctx.addIssue({code:'custom',path:['cells',key],message:'Duplicate coordinate aliases'});else data.cells[normalized]=data.cells[key];delete data.cells[key];}}
  for(const piece of Object.values(data.pieces))piece.cell=coordinate(piece.cell);
  for(const annotation of Object.values(data.annotations))annotation.cells=annotation.cells.map(coordinate);

  const validCell=(key:string)=>{const m=/^r([1-9]\d*)c([1-9]\d*)$/.exec(key);return !!m&&Number(m[1])>=1&&Number(m[1])<=preset.rows&&Number(m[2])>=1&&Number(m[2])<=preset.columns;};
  const bad=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
  for(const key of Object.keys(data.cells))if(!validCell(key))bad(['cells',key],'Cell is outside this preset');
  for(const [key,p] of Object.entries(data.pieces))if(!validCell(p.cell))bad(['pieces',key,'cell'],'Piece cell is outside this preset');
  for(const [key,c] of Object.entries(data.counters))if(c.zone&&!Object.hasOwn(data.zones,c.zone))bad(['counters',key,'zone'],'Counter zone does not exist');
  for(const [key,c] of Object.entries(data.cards))if(!Object.hasOwn(data.zones,c.zone))bad(['cards',key,'zone'],'Card zone does not exist');
  if(preset.family!=='cards'&&Object.keys(data.cards).length)bad(['cards'],'Cards require a card-table preset');
  for(const [key,a] of Object.entries(data.annotations))if(a.cells.some(c=>!validCell(c)))bad(['annotations',key,'cells'],'Annotation cell is outside this preset');
});
export type GameData = z.infer<typeof gameDataSchema>;
export function gameExample(preset:GamePreset): GameData {
  const data: Record<string,unknown>={preset};
  if(preset==='chess')data.pieces={whiteKing:{cell:'r8c5',symbol:'king',color:'white'},blackKing:{cell:'r1c5',symbol:'king',color:'black'},knight:{cell:'r8c7',symbol:'knight',color:'white'}};
  if(preset==='sudoku')data.cells={r1c1:{value:'5',given:true},r1c2:{notes:['1','3','7']},r2c4:{value:'6',emphasis:'selected'}};
  if(preset==='tic-tac-toe')data.pieces={cross:{cell:'r1c1',symbol:'X'},circle:{cell:'r2c2',symbol:'O'}};
  if(preset==='connect-four')data.pieces={red1:{cell:'r6c3',symbol:'disc',color:'red'},yellow1:{cell:'r6c4',symbol:'disc',color:'yellow'}};
  if(preset==='poker'){data.zones={community:{label:'Community'},seat1:{label:'Alex',badge:'Dealer',counter:'Chips 240'},seat2:{label:'Sam',counter:'Chips 180'}};data.cards={flop1:{face:'up',zone:'community',order:0,rank:'A',suit:'hearts'},flop2:{face:'up',zone:'community',order:1,rank:'10',suit:'spades'},unknown1:{face:'back',zone:'seat1',order:0},unknown2:{face:'back',zone:'seat2',order:0}};data.counters={pot:{label:'Pot',value:'80'}};}
  if(preset==='checkers')data.pieces={light:{cell:'r6c1',symbol:'disc',color:'white'},dark:{cell:'r3c2',symbol:'disc',color:'black'}};
  if(preset==='go')data.pieces={stone1:{cell:'r4c4',symbol:'disc',color:'black'},stone2:{cell:'r4c16',symbol:'disc',color:'white'}};
  if(preset==='reversi')data.pieces={a:{cell:'r4c4',symbol:'disc',color:'white'},b:{cell:'r5c5',symbol:'disc',color:'white'},c:{cell:'r4c5',symbol:'disc',color:'black'},d:{cell:'r5c4',symbol:'disc',color:'black'}};
  if(preset==='backgammon'){data.pieces={a:{cell:'r1c1',symbol:'disc',color:'white',stack:2},b:{cell:'r2c6',symbol:'disc',color:'black',stack:5},bar:{cell:'r1c7',symbol:'disc',color:'white',stack:1}};data.counters={dice:{label:'Dice',value:'3 · 5'},borneOff:{label:'White borne off',value:'2'}};}
  if(preset==='blackjack'){data.zones={dealer:{label:'Dealer'},player:{label:'Player',counter:'Bet 20'}};data.cards={a:{face:'up',zone:'dealer',order:0,rank:'9',suit:'hearts'},b:{face:'back',zone:'dealer',order:1},c:{face:'up',zone:'player',order:0,rank:'K',suit:'clubs'},d:{face:'up',zone:'player',order:1,rank:'7',suit:'diamonds'}};}
  if(preset==='solitaire'){data.zones={stock:{label:'Stock'},waste:{label:'Waste'},foundation:{label:'Foundation 1'},foundation2:{label:'Foundation 2'},foundation3:{label:'Foundation 3'},foundation4:{label:'Foundation 4'},column1:{label:'Column 1'},column2:{label:'Column 2'},column3:{label:'Column 3'},column4:{label:'Column 4'},column5:{label:'Column 5'},column6:{label:'Column 6'},column7:{label:'Column 7'}};data.cards={a:{face:'back',zone:'stock',order:0},b:{face:'up',zone:'foundation',order:0,rank:'A',suit:'spades'},c:{face:'up',zone:'column1',order:0,rank:'Q',suit:'hearts'},d:{face:'up',zone:'column2',order:0,rank:'K',suit:'clubs'},e:{face:'up',zone:'column1',order:1,rank:'J',suit:'clubs'}};}
  if(preset==='battleship'){data.cells={r3c3:{value:'●',emphasis:'warning'},r3c4:{value:'■'},r3c5:{value:'■'},r6c16:{value:'×',emphasis:'last-move'}};data.annotations={grids:{text:'Left: supplied own board · Right: supplied known shots only'}};}
  if(preset==='crossword'){data.cells={r1c1:{value:'C',number:1},r1c2:{value:'A'},r1c3:{value:'T'},r1c4:{blocked:true},r2c1:{value:'A'},r3c1:{value:'R'},r4c1:{blocked:true}};data.annotations={across1:{text:'1 Across: feline',cells:['r1c1','r1c2','r1c3']},down1:{text:'1 Down: road vehicle',cells:['r1c1','r2c1','r3c1']}};}
  if(preset==='word-search'){data.cells=Object.fromEntries(Array.from({length:100},(_,i)=>[`r${Math.floor(i/10)+1}c${i%10+1}`,{value:'KANVASWORD'.charAt(i%10)||'S',emphasis:i<6?'selected':'none'}]));data.annotations={word:{text:'KANVAS',cells:['r1c1','r1c2','r1c3','r1c4','r1c5','r1c6']}};}
  if(preset==='sliding-tile')data.pieces=Object.fromEntries(Array.from({length:15},(_,i)=>[`tile${i+1}`,{cell:`r${Math.floor(i/4)+1}c${i%4+1}`,symbol:'tile',label:String(i+1),color:'blue'}]));
  return gameDataSchema.parse(data);
}
