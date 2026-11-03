import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared} from './support';
import {mathExample} from '../../src/shared/math-workspace';

test('built mathematical notation loads all declared fonts under the application CSP',async({page})=>{
 await register(page);const session=await createSession(page,'Math font CSP'),display=await createDisplay(page,session,'Notation');
 await publishPrepared(page,session,[display.id],{version:1,template:'math',data:mathExample});
 const viewer=await openViewer(page,session,display.id);
 await expect(viewer.locator('.math-workspace .katex').first()).toBeVisible();
 // Load every bundled KaTeX face, including small size faces that Vite used to inline.
 // Existing browser diagnostics also reject every CSP/console/network error.
 const loaded=await viewer.evaluate(async()=>{
  const faces=Array.from(document.fonts).filter(face=>face.family.includes('KaTeX'));
  await Promise.all(faces.map(face=>face.load()));
  return faces.map(face=>({family:face.family,status:face.status}));
 });
 expect(loaded.length).toBeGreaterThan(0);
 expect(loaded.every(face=>face.status==='loaded')).toBe(true);
 expect(await viewer.evaluate(()=>Array.from(document.fonts).some(face=>face.family.includes('KaTeX_Main')&&face.status==='loaded'))).toBe(true);
 await viewer.close();
});
