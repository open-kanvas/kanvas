import { z } from 'zod';

export const GAME_PRESETS = ['chess', 'poker', 'sudoku', 'tic-tac-toe', 'connect-four'] as const;
export type GamePreset = typeof GAME_PRESETS[number];
export const gamePresets: Record<GamePreset, { label: string; rows: number; columns: number; family: 'squares'|'cards'|'discs' }> = {
  chess: { label: 'Chess', rows: 8, columns: 8, family: 'squares' },
  poker: { label: 'Texas Hold’em', rows: 0, columns: 0, family: 'cards' },
  sudoku: { label: 'Sudoku', rows: 9, columns: 9, family: 'squares' },
  'tic-tac-toe': { label: 'Tic-tac-toe', rows: 3, columns: 3, family: 'squares' },
  'connect-four': { label: 'Connect Four', rows: 6, columns: 7, family: 'discs' },
};
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v),'Reserved ID');
const text = z.string().max(200);
const emphasis = z.enum(['none','selected','last-move','warning']).default('none');
const color = z.enum(['white','black','red','yellow','blue','green']).default('white');
const cell = z.object({ value:text.optional(), notes:z.array(z.string().max(8)).max(12).optional(), given:z.boolean().optional(), blocked:z.boolean().optional(), number:z.number().int().min(1).max(999).optional(), emphasis }).strict();
const piece = z.object({ cell: id, symbol:z.enum(['king','queen','rook','bishop','knight','pawn','disc','X','O','tile']), color, label:z.string().max(12).optional(), emphasis }).strict();
const card = z.discriminatedUnion('face',[
  z.object({ face:z.literal('up'), zone:id, order:z.number().int().min(0).max(100), rank:z.enum(['A','2','3','4','5','6','7','8','9','10','J','Q','K']), suit:z.enum(['clubs','diamonds','hearts','spades']), emphasis }).strict(),
  // An unknown back has NO retained identity. It is not a private card hidden by CSS.
  z.object({ face:z.literal('back'), zone:id, order:z.number().int().min(0).max(100), emphasis }).strict(),
]);
const bounded = <T extends z.ZodType>(schema:T, max:number) => z.record(id,schema).refine(v=>Object.keys(v).length<=max,`At most ${max} entries`);
export const gameDataSchema = z.object({
  preset:z.enum(GAME_PRESETS), visibility:z.literal('public').default('public').describe('All supplied state is visible to every authorized session reader. No private/recipient payloads; unknown card backs contain no identities.'),
  positionLabel:text.default('Live position'),
  cells:bounded(cell,800).default({}), pieces:bounded(piece,200).default({}),
  zones:bounded(z.object({ label:text, badge:text.optional(), counter:text.optional() }).strict(),32).default({}),
  cards:bounded(card,104).default({}), counters:bounded(z.object({ label:text, value:text }).strict(),32).default({}),
  annotations:bounded(z.object({ text, cells:z.array(id).max(100).default([]) }).strict(),32).default({}),
}).strict().superRefine((data,ctx)=>{
  const preset=gamePresets[data.preset];
  const validCell=(key:string)=>{const m=/^r([1-9]\d*)c([1-9]\d*)$/.exec(key);return !!m&&Number(m[1])>=1&&Number(m[1])<=preset.rows&&Number(m[2])>=1&&Number(m[2])<=preset.columns;};
  const bad=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
  for(const key of Object.keys(data.cells))if(!validCell(key))bad(['cells',key],'Cell is outside this preset');
  for(const [key,p] of Object.entries(data.pieces))if(!validCell(p.cell))bad(['pieces',key,'cell'],'Piece cell is outside this preset');
  for(const [key,c] of Object.entries(data.cards))if(!Object.hasOwn(data.zones,c.zone))bad(['cards',key,'zone'],'Card zone does not exist');
  if(preset.family!=='cards'&&Object.keys(data.cards).length)bad(['cards'],'Cards require a card-table preset');
  for(const [key,a] of Object.entries(data.annotations))if(a.cells.some(c=>!validCell(c)))bad(['annotations',key,'cells'],'Annotation cell is outside this preset');
});
export type GameData = z.infer<typeof gameDataSchema>;
export function gameExample(preset:GamePreset): GameData {
  const data: Record<string,unknown>={preset};
  if(preset==='chess')data.pieces={whiteKing:{cell:'r8c5',symbol:'king',color:'white'},blackKing:{cell:'r1c5',symbol:'king',color:'black'},knight:{cell:'r8c7',symbol:'knight',color:'white'}};
  if(preset==='sudoku')data.cells={r1c1:{value:'5',given:true},r1c2:{notes:['1','3','7']},r2c4:{value:'6',emphasis:'selected'}};
  if(preset==='tic-tac-toe')data.pieces={cross:{cell:'r1c1',symbol:'X',color:'blue'},circle:{cell:'r2c2',symbol:'O',color:'red'}};
  if(preset==='connect-four')data.pieces={red1:{cell:'r6c3',symbol:'disc',color:'red'},yellow1:{cell:'r6c4',symbol:'disc',color:'yellow'}};
  if(preset==='poker'){data.zones={community:{label:'Community'},seat1:{label:'Alex',badge:'Dealer',counter:'Chips 240'},seat2:{label:'Sam',counter:'Chips 180'}};data.cards={flop1:{face:'up',zone:'community',order:0,rank:'A',suit:'hearts'},flop2:{face:'up',zone:'community',order:1,rank:'10',suit:'spades'},unknown1:{face:'back',zone:'seat1',order:0},unknown2:{face:'back',zone:'seat2',order:0}};data.counters={pot:{label:'Pot',value:'80'}};}
  return gameDataSchema.parse(data);
}
