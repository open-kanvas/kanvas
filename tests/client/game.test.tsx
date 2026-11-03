import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GameRenderer} from '../../src/client/renderers/Game';
import {GAME_PRESETS,gameExample,gameDataSchema,gamePresets} from '../../src/shared/game';
import {validateView} from '../../src/shared/view-schemas';
describe('shared supplied-state game catalog',()=>{
 it.each(GAME_PRESETS)('validates and renders %s without rules/inference',preset=>{
  const data=gameExample(preset);expect(validateView({version:1,template:'game-board',data}).data).toEqual(data);
  const html=renderToStaticMarkup(<GameRenderer data={data}/>);expect(html).toContain(gamePresets[preset].label);expect(html).not.toContain('<button');
 });
 it('supports an explicitly supplied full 19 by 19 Go position',()=>{
  const pieces=Object.fromEntries(Array.from({length:361},(_,i)=>[`stone${i+1}`,{cell:`r${Math.floor(i/19)+1}c${i%19+1}`,symbol:'disc',color:i%2?'white':'black'}]));const data=gameDataSchema.parse({preset:'go',pieces});expect(Object.keys(data.pieces)).toHaveLength(361);expect(renderToStaticMarkup(<GameRenderer data={data}/>).match(/data-game-piece=/g)).toHaveLength(361);
 });
 it('rejects invalid cells, dangling zones, secret backs and recipient payloads',()=>{
  for(const data of [{preset:'chess',pieces:{knight:{cell:'r9c1',symbol:'knight'}}},{preset:'poker',cards:{a:{face:'up',zone:'missing',order:0,rank:'A',suit:'spades'}}},{preset:'poker',zones:{hand:{label:'Hand'}},cards:{a:{face:'back',zone:'hand',order:0,rank:'A',suit:'spades'}}},{preset:'poker',visibility:'private'},{preset:'poker',recipients:{alice:{cards:['AS']}}},{preset:'sudoku',cells:{r0c1:{value:'1'}}},{preset:'chess',pieces:{a:{cell:'r01c1',symbol:'king'}}}])expect(gameDataSchema.safeParse(data).success).toBe(false);
 });
 it('renders unknown backs without retained card identity; escapes supplied text',()=>{
  const data=gameExample('poker');data.zones.seat1.label='<script>alert(1)</script>';
  const html=renderToStaticMarkup(<GameRenderer data={data}/>);expect(html).toContain('Unknown card');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 });
});
