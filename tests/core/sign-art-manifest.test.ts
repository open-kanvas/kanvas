import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {signCatalog} from '../../src/shared/signage';
import {SIGN_ART} from '../../src/shared/sign-art';
it('accounts for every sign and distributes exact reviewed artwork with license and credits',()=>{
 const manifest=JSON.parse(readFileSync('public/signage/manifest.json','utf8'));
 const coverage=manifest.coverage as {signType:string;assetId?:string;decision:string}[];
 expect(coverage.map(x=>x.signType).sort()).toEqual(signCatalog.map(x=>x.id).sort());
 expect(new Set(coverage.map(x=>x.signType)).size).toBe(137);
 const hash=(path:string)=>createHash('sha256').update(readFileSync('public'+path)).digest('hex');
 expect(hash('/signage/LICENSE-APACHE-2.0.txt')).toBe(manifest.licenseSha256);
 for(const asset of manifest.assets){
  expect(asset.chosenLicense).toBe('Apache-2.0');expect(asset.modified).toBe(false);
  expect(asset.sourceUrl).toContain('/'+manifest.revision+'/');
  expect(hash(asset.path)).toBe(asset.sha256);
 }
 for(const item of coverage){
  if(item.decision==='replaced'){const asset=manifest.assets.find((a:any)=>a.id===item.assetId);expect(asset).toBeTruthy();expect(SIGN_ART[item.signType]).toBe(asset.path);}
  else expect(SIGN_ART[item.signType]).toBeUndefined();
 }
 for(const prohibited of ['exit','no-smoking'])expect(SIGN_ART[prohibited]).toBeUndefined();
 expect(readFileSync('public/signage/credits.html','utf8')).toContain('Apache');
 expect(readFileSync('public/signage/NOTICE.txt','utf8')).toContain('Google');
});
