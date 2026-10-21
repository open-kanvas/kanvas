import {initializeDiagnostics} from './frontend-diagnostics';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './console-refresh.css';
import { initializeWindowIdentity } from './window-identity';

const installed=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone;
const launchWindow=window as Window & {launchQueue?:{setConsumer:(callback:(params:{targetURL?:string})=>void)=>void}};
launchWindow.launchQueue?.setConsumer(()=>{if(installed&&location.pathname!=='/'&&!location.hash.startsWith('#email-signin='))location.replace('/');});
// Installed browsers without LaunchQueue may restore an old deep route on cold launch.
if(installed&&!sessionStorage.getItem('kanvas-installed-open')&&!location.search&&!location.hash&&location.pathname!=='/')location.replace('/');
if(installed)sessionStorage.setItem('kanvas-installed-open','1');
initializeDiagnostics();
const root = document.getElementById('root');
if (!root) throw new Error('KANVAS root element is missing.');
void initializeWindowIdentity().then(()=>createRoot(root).render(<StrictMode><App /></StrictMode>));
