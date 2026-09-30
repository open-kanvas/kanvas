import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { databaseOptions, type DatabaseOptions } from '../src/server/database-config.js';

export async function postgresEnvironment(options:DatabaseOptions, directory:string):Promise<NodeJS.ProcessEnv>{
  const env:NodeJS.ProcessEnv={...process.env,PGHOST:options.host,PGPORT:String(options.port??5432),PGUSER:options.user,PGDATABASE:options.database,PGCONNECT_TIMEOUT:'5'};
  delete env.PGPASSWORD;delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.PGOPTIONS;
  env.PGSSLMODE=options.ssl?'verify-full':'disable';
  if(options.ssl&&typeof options.ssl==='object'&&options.ssl.ca){const caFile=join(directory,'ca.pem');await writeFile(caFile,options.ssl.ca as string,{mode:0o600});env.PGSSLROOTCERT=caFile;}
  if(options.password){
    if(typeof options.password!=='string')throw new Error('Use a provisioned password file for database utilities.');
    const escape=(value:string)=>value.replaceAll('\\','\\\\').replaceAll(':','\\:');
    const passfile=join(directory,'pgpass');
    await writeFile(passfile,`*:${options.port??5432}:${escape(options.database??'kanvas')}:${escape(options.user??'kanvas')}:${escape(options.password)}\n`,{mode:0o600});env.PGPASSFILE=passfile;
  }else delete env.PGPASSFILE;
  return env;
}
export function runPostgresTool(command:string,args:string[],env:NodeJS.ProcessEnv):Promise<void>{
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env,stdio:['ignore','ignore','ignore']});
    child.on('error',()=>reject(new Error('PostgreSQL utility could not start. Install a matching PostgreSQL client.')));
    child.on('exit',code=>code===0?resolve():reject(new Error('PostgreSQL utility failed; no raw connection or database details are emitted.')));
  });
}
export async function backupPostgres(options:DatabaseOptions,destinationPath:string){
  const destination=resolve(destinationPath);
  await mkdir(dirname(destination),{recursive:true,mode:0o700});
  const parent=await realpath(dirname(destination));
  try{await lstat(destination);throw new Error('Backup destination already exists.');}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw error;}
  const stage=await mkdtemp(join(parent,'.kanvas-pg-backup-'));await chmod(stage,0o700);
  try{
    const snapshot=join(stage,'database.dump'),env=await postgresEnvironment(options,stage);
    await runPostgresTool('pg_dump',['--format=custom','--no-owner','--no-privileges','--schema',options.schema??'public','--file',snapshot],env);
    await chmod(snapshot,0o600);
    await runPostgresTool('pg_restore',['--list',snapshot],env);
    const file=await open(snapshot,constants.O_RDONLY|constants.O_NOFOLLOW);try{await file.sync();}finally{await file.close();}
    await link(snapshot,join(parent,basename(destination)));
    const directory=await open(parent,constants.O_RDONLY|constants.O_DIRECTORY);try{await directory.sync();}finally{await directory.close();}
    return {format:'postgresql-custom',schema:options.schema??'public',destination,bytes:(await stat(destination)).size,createdAt:new Date().toISOString(),archiveChecked:true};
  }finally{await rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  process.umask(0o077);
  if(process.argv.length!==4||process.argv[2]!=='--out'){console.error('Usage: backup-postgres --out NEW_FILE.dump (connection: KANVAS_PG_* settings).');process.exitCode=1;}
  else try{console.log(JSON.stringify(await backupPostgres(databaseOptions(),process.argv[3]),null,2));}
  catch{console.error('KANVAS PostgreSQL backup failed. Check the connection, matching client utilities and a new writable destination.');process.exitCode=1;}
}
