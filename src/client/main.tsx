import {initializeDiagnostics} from './frontend-diagnostics';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './console-refresh.css';
import { initializeWindowIdentity } from './window-identity';

const installed=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone;
const launchWindow=window as Window & {launchQueue?:{setConsumer:(callback:(params:{targetURL?:string})=>void)=>void}};
// Honor explicit same-origin launch destinations (notably push session/display
// links). The manifest supplies / for an ordinary icon launch. Never infer an
// icon launch from an empty sessionStorage: closed-app push is also a cold start.
launchWindow.launchQueue?.setConsumer(({targetURL})=>{
 if(!installed||!targetURL||location.hash.startsWith('#email-signin='))return;
 try{const target=new URL(targetURL,location.origin);if(target.origin!==location.origin)return;
  if(target.href!==location.href)location.replace(target.href);
 }catch{/* Invalid launch metadata cannot redirect the viewer. */}
});
initializeDiagnostics();
const root = document.getElementById('root');
if (!root) throw new Error('KANVAS root element is missing.');
void initializeWindowIdentity().then(()=>createRoot(root).render(<StrictMode><App /></StrictMode>));
