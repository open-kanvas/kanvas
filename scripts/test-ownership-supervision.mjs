// Destructive fault injection is restricted to this script's private cluster/unit.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import pg from 'pg';
const root=process.cwd();assert.equal(process.env.KANVAS_RECOVERY_FAULT_TEST,'1','Explicit disposable fault-test opt-in required');
const base=mkdtempSync('/tmp/kanvas-recovery-supervision.'),socket=base+'/socket',data=base+'/data';mkdirSync(socket);
const pgBin='/usr/lib/postgresql/16/bin/',unit='kanvas-recovery-test-'+process.pid,port=18861,pgPort=55462;
const cmd=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const ctl=(...args)=>cmd(pgBin+'pg_ctl',['-D',data,...args]);
const system=(...args)=>cmd('sudo',['systemctl',...args,unit]);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const options={host:socket,port:pgPort,user:'deploy',database:'kanvas_test'};
const report={checks:[],timings:{}};const check=name=>{report.checks.push(name);console.log('PASS '+name);};
let dbRunning=false;
async function sql(query,values=[]){const c=new pg.Client(options);await c.connect();try{return await c.query(query,values);}finally{await c.end();}}
async function ready(){try{const r=await fetch(`http://127.0.0.1:${port}/readyz`,{signal:AbortSignal.timeout(1000)});return r.ok&&(await r.json()).status==='ready';}catch{return false;}}
async function waitReady(){const start=Date.now();while(Date.now()-start<45000){if(await ready())return Date.now()-start;await delay(250);}throw Error('Readiness did not recover');}
const pid=()=>system('show','-p','MainPID','--value').trim();
const restarts=()=>Number(system('show','-p','NRestarts','--value').trim());
async function waitNewPid(old){const start=Date.now();while(Date.now()-start<15000){if(pid()!==old)return;await delay(100);}throw Error('Owner did not exit within deadline');}
function startDb(){ctl('-l',base+'/postgres.log','-o',`-k ${socket} -p ${pgPort} -c listen_addresses='' -c shared_buffers=16MB`,'-w','start');dbRunning=true;}
try{
 cmd(pgBin+'initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8']);startDb();
 cmd(pgBin+'createdb',['-h',socket,'-p',String(pgPort),'kanvas_test']);
 const unitFile=`[Unit]
Description=Disposable Kanvas ownership recovery test
StartLimitIntervalSec=10s
StartLimitBurst=5
[Service]
User=deploy
WorkingDirectory=${root}
Restart=on-failure
RestartSec=5s
TimeoutStopSec=15s
Environment=HOST=127.0.0.1 PORT=${port} KANVAS_PUBLIC_URL=http://127.0.0.1:${port} KANVAS_PG_HOST=${socket} KANVAS_PG_PORT=${pgPort} KANVAS_PG_USER=deploy KANVAS_PG_DATABASE=kanvas_test KANVAS_PG_SCHEMA=recoverytest KANVAS_EMAIL_SIGNIN=false KANVAS_PUSH_ENABLED=false
ExecStart=/opt/node/bin/node ${root}/dist/server/index.js
`;
 writeFileSync(base+'/unit.service',unitFile);
 cmd('sudo',['install','-m','644',base+'/unit.service',`/run/systemd/system/${unit}.service`]);
 cmd('sudo',['systemctl','daemon-reload']);system('start');
 await waitReady();check('isolated dev service ready under systemd');
 await sql("INSERT INTO recoverytest.documents(kind,id,session_id,value) VALUES('proof','keep','','{\"id\":\"keep\",\"value\":42}')");
 await sql("INSERT INTO recoverytest.requests(session_id,principal,request_id,digest,result_id,kind) VALUES('test','test','receipt','digest','keep','submit')");
 const old=pid(),count=restarts(),begin=Date.now();
 const killed=await sql("SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype='advisory' AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND objid=(hashtextextended('kanvas:runtime:recoverytest',0) & 4294967295)::oid AND classid=((hashtextextended('kanvas:runtime:recoverytest',0) >> 32) & 4294967295)::oid");assert.equal(killed.rowCount,1);
 await waitNewPid(old);await waitReady();assert(restarts()>count);report.timings.backendTerminationMs=Date.now()-begin;check('ownership backend termination causes bounded exit and unattended restart');
 const old2=pid(),begin2=Date.now();ctl('-m','fast','-w','stop');dbRunning=false;await waitNewPid(old2);
 const before=restarts();await delay(12000);assert(!(await ready()));assert(restarts()>before);check('prolonged database outage retries with backoff and never serves ready');
 startDb();await waitReady();report.timings.databaseOutageRecoveryMs=Date.now()-begin2;check('real database restart recovers readiness without manual app restart');
 assert.equal((await sql("SELECT value FROM recoverytest.documents WHERE id='keep'")).rows[0].value,'{"id":"keep","value":42}');
 assert.equal((await sql("SELECT digest FROM recoverytest.requests WHERE request_id='receipt'")).rows[0].digest,'digest');check('data and idempotency receipt survive fault cycles');
 system('stop');const competitor=new pg.Client(options);await competitor.connect();
 try{await competitor.query("SELECT pg_advisory_lock(hashtextextended('kanvas:runtime:recoverytest',0))");system('start');await delay(8000);assert(!(await ready()));assert(restarts()>0);check('competing ownership prevents serving during recovery');}
 finally{await competitor.end();}
 await waitReady();check('readiness returns only after legitimate lock reacquisition');
 system('stop');await delay(1500);assert.equal(pid(),'0');assert.equal(system('show','-p','ExecMainStatus','--value').trim(),'0');check('intentional stop exits zero and does not restart');
 report.passed=true;
}finally{
 try{system('stop');}catch{};try{system('reset-failed');}catch{}
 try{cmd('sudo',['rm','-f',`/run/systemd/system/${unit}.service`]);cmd('sudo',['systemctl','daemon-reload']);}catch{}
 if(dbRunning)ctl('-m','fast','-w','stop');
 mkdirSync(root+'/test-results',{recursive:true});writeFileSync(root+'/test-results/supervision.json',JSON.stringify(report,null,2));
}
