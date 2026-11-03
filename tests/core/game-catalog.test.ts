import {afterEach,it,expect} from 'vitest';
import {startHarness,type Harness} from './harness';
import {GAME_PRESETS,gameExample,type GameData} from '../../src/shared/game';
let h:Harness;afterEach(async()=>{await h?.close();});
it('publishes and element-patches all fifteen presets through the same persisted operation family',async()=>{
 h=await startHarness();const a=await h.account(),s=await a.session(),d=await a.display(s.id),service=h.runtime.service,p={userId:a.user!.id};
 expect(GAME_PRESETS).toHaveLength(15);
 for(const preset of GAME_PRESETS){
  const publication=await a.submit(s.id,[d.id],{version:1,template:'game-board',data:gameExample(preset)});expect(publication.update.status).toBe('prepared');
  const before=await service.display(p,s.id,d.id),data=before.view!.data as GameData;
  const family=Object.keys(data.pieces).length?'pieces':Object.keys(data.cards).length?'cards':'cells',key=Object.keys(data[family])[0];expect(key).toBeDefined();
  await service.execute('kanvas_view_patch',{sessionId:s.id,displayId:d.id,requestId:`${preset}-element`,expectedRevision:before.revision,operations:[{op:'set',path:`/data/${family}/${key}/emphasis`,value:'selected'}]},p);
  const after=await service.display(p,s.id,d.id);expect(after.revision).toBe(before.revision+1);expect(after.view!.data.preset).toBe(preset);expect((after.view!.data[family] as Record<string,{emphasis:string}>)[key].emphasis).toBe('selected');
  const expected=structuredClone(data);(expected[family][key] as {emphasis:string}).emphasis='selected';expect(after.view!.data).toEqual(expected);
 }
},30000);
