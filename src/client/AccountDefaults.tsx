import {PushSettings} from './PushSettings';
import {supportReference} from './frontend-diagnostics';
import { ReadingSettings } from './ReadingSettings';
import { useEffect, useState } from 'react';
import type { SessionConfig } from '../shared/types';
import { api } from './api';
import { useTask } from './hooks';
import { Button, ErrorNotice } from './components/ui';
export function AccountDefaults({config}:{config:SessionConfig}){
  const [personal,setPersonal]=useState<SessionConfig>(config);
  const [revision,setRevision]=useState<number|undefined>(),[saved,setSaved]=useState(false);const task=useTask();
  useEffect(()=>{void api<{revision:number;config:SessionConfig}>('/api/preferences').then(x=>{setRevision(x.revision);setPersonal(x.config);}).catch(()=>{});},[]);
  if(revision===undefined)return null;
  return <section className="account-defaults"><PushSettings/><p>Support reference: {supportReference}</p><h3>Your new-session defaults</h3><p>Copy this session’s current settings to your account. Existing standalone sessions stay unchanged. Personal appearance also applies in sessions using group inheritance unless the session overrides it. A designated presenter is not copied.</p><Button variant="secondary" busy={task.busy} onClick={()=>void task.run(async()=>{const result=await api<{revision:number}>('/api/preferences',{method:'PATCH',body:{expectedRevision:revision,config:{...Object.fromEntries(Object.entries(config).filter(([key])=>key!=='branding')),presenterViewerId:'',...(config.syncMode==='presenter'?{syncMode:'independent'}:{})}}});setRevision(result.revision);setSaved(true);})}>Use these settings for new sessions</Button><label className="field">Default theme<select aria-label="Default theme" value={personal.theme} disabled={task.busy} onChange={e=>{const theme=e.target.value as SessionConfig['theme'];void task.run(async()=>{const result=await api<{revision:number;config:SessionConfig}>('/api/preferences',{method:'PATCH',body:{expectedRevision:revision,config:{theme}}});setRevision(result.revision);setPersonal(result.config);setSaved(true);});}}><option value="system">System · follow each device</option><option value="light">Light</option><option value="dark">Dark</option></select></label><ReadingSettings value={personal} disabled={task.busy} change={patch=>void task.run(async()=>{const result=await api<{revision:number;config:SessionConfig}>('/api/preferences',{method:'PATCH',body:{expectedRevision:revision,config:patch}});setRevision(result.revision);setPersonal(result.config);setSaved(true);})}/><ErrorNotice message={task.error}/>{saved&&<p role="status">New-session defaults saved.</p>}</section>;
}
