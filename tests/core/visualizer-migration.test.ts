import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../../src/server/store.js';
import { migrateDatabase } from '../../src/server/database-migrations.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { testDatabase, removeTestDatabase } from '../postgres.js';
import type { DatabaseOptions } from '../../src/server/database-config.js';
const stores:Store[]=[],databases:DatabaseOptions[]=[];
afterEach(async()=>{for(const s of stores.splice(0))await s.close();for(const db of databases.splice(0))await removeTestDatabase(db);});
describe('visualizer-only data migration',()=>{
  it('removes retired data, safely normalizes history, preserves exact unrelated source and remains schema-v1 compatible',async()=>{
    const db=testDatabase();databases.push(db);const s=new Store(db);stores.push(s);await s.ready;
    const config={mode:'translation',modeExplicit:true,model:'synthetic/retired',language:'nb',sourceLanguage:'en',retainOriginal:true,updatePolicy:'proactive',theme:'light',accent:'#123456',density:'compact',syncMode:'shared'};
    await s.put('session',{id:'session',config});await s.put('preferences',{id:'user',config});
    for(const kind of ['game','game-receipt','demo','demo-receipt'])await s.put(kind,{id:'retired'});
    const view={version:1,template:'game',data:{gameId:'retired'}};
    await s.put('view-pin',{id:'pin',view});await s.put('deck',{id:'deck',slides:[view]});await s.put('display',{id:'display',view,revision:7});await s.put('display-history',{id:'history',view:{version:1,template:'presentation',data:{slides:[view,{version:1,template:'fact',data:{text:'Keep this.'}}],index:0}},revision:7});
    await s.put('invitation',{id:'invite',gameId:'retired',label:'Synthetic'});
    await s.put('update',{id:'update',metrics:{modelMs:900,requestedModel:'synthetic/retired',renderMs:10,validationMs:2,'display.display.modelMs':900,'display.display.validationMs':2}});
    const raw='{ "id":"literal", "amount":9007199254740993.00100, "negative":-0, "text":"model and mode are source words" }';
    await s.query('INSERT INTO documents(kind,id,value) VALUES($1,$2,$3)',['dataset','literal',raw]);
    await s.query('DELETE FROM data_migrations');const client=await s.pool.connect();try{await migrateDatabase(client,s.schema);await migrateDatabase(client,s.schema);}finally{client.release();}
    for(const kind of ['game','game-receipt','demo','demo-receipt'])expect(await s.list(kind)).toEqual([]);
    const session=await s.get<any>('session','session');expect(session.config).toEqual({theme:'light',accent:'#123456',density:'compact',syncMode:'shared'});
    expect((await s.get<any>('display','display'))).toMatchObject({revision:7,view:{template:'fact'}});
    expect((await s.get<any>('display-history','history')).view.data.slides[1].data.text).toBe('Keep this.');
    expect((await s.get<any>('view-pin','pin')).view.template).toBe('fact');expect((await s.get<any>('deck','deck')).slides[0].template).toBe('fact');
    expect((await s.get<any>('invitation','invite')).revokedAt).toBeDefined();expect(await s.get<any>('invitation','invite')).not.toHaveProperty('gameId');
    expect((await s.get<any>('update','update')).metrics).toEqual({renderMs:10,validationMs:2,'display.display.validationMs':2});
    expect((await s.query('SELECT value FROM documents WHERE kind=$1 AND id=$2',['dataset','literal'])).rows[0].value).toBe(raw);
    expect((await s.query('SELECT version FROM schema_migrations')).rows).toEqual([{version:1}]);expect((await s.query('SELECT version FROM data_migrations')).rows).toEqual([{version:1}]);
    await s.put('display-history',{id:'late-history',view});expect((await s.get<any>('display-history','late-history')).view.template).toBe('fact');
  });
  it.each(['mode','modeExplicit','model','language','sourceLanguage','retainOriginal','updatePolicy'])('rejects retired setting %s at the public boundary',key=>{
    expect(configPatchSchema.safeParse({theme:'dark',[key]:'retired'}).success).toBe(false);
  });
});
