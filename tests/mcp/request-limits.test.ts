import express from 'express';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mountMcp } from '../../src/server/mcp/index.js';
import { mcpRequestLimit, MCP_MAX_BODY_BYTES, MCP_MAX_INPUT_ELEMENTS } from '../../src/server/mcp/request-limits.js';
import { DomainFixture, harness } from './harness.js';

describe('MCP abuse bounds with heavy-use headroom', () => {
  it('allows 100 messages and 1500000 elements, rejects the next, and bounds nesting', () => {
    expect(mcpRequestLimit(Array.from({length:100}, () => ({jsonrpc:'2.0',method:'tools/list'})))).toBeUndefined();
    expect(mcpRequestLimit(Array(101).fill(null))).toMatch(/100 messages/);
    expect(mcpRequestLimit({ rows:Array(MCP_MAX_INPUT_ELEMENTS-1).fill(0) })).toBeUndefined();
    expect(mcpRequestLimit({ rows:Array(MCP_MAX_INPUT_ELEMENTS).fill(0) })).toMatch(/input elements/);
    let deep: unknown = {}; for(let i=0;i<130;i++)deep={child:deep};
    expect(mcpRequestLimit(deep)).toMatch(/nesting/);
    expect(mcpRequestLimit({rows:Array.from({length:20000},(_,n)=>({id:n,value:n,text:'value'}))})).toBeUndefined();
  });
  it('rejects hostile requests before dispatch, preserves compressed bodies, and survives trailing bytes', async () => {
    const app=express(), service=new DomainFixture(), mounted=mountMcp(app,service);
    const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
    const address=server.address(); if(!address||typeof address==='string')throw Error('listener');
    const url='http://127.0.0.1:'+address.port+'/mcp', bearer=service.issue('owner');
    const headers={'Authorization':'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'};
    const post=(body:string|Buffer,extra={})=>fetch(url,{method:'POST',headers:{...headers,...extra},body,signal:AbortSignal.timeout(5000)});
    const ping=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'request-bounds-test',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}});
    try {
      for(const body of [Array(101).fill({jsonrpc:'2.0',id:1,method:'tools/list'}),{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kanvas_call',arguments:{rows:Array(1500001).fill(null)}}}]) {
        const response=await post(JSON.stringify(body));expect(response.status).toBe(400);expect(await response.text()).toMatch(/messages|elements/);
      }
      const large=await post(JSON.stringify({data:'x'.repeat(MCP_MAX_BODY_BYTES)}));expect(large.status).toBe(413);await large.text();
      const compressed=await post(gzipSync(ping),{'Content-Encoding':'gzip'});const compressedText=await compressed.text();expect(compressed.status,compressedText).toBe(200);
      const malformed=await post(Buffer.concat([gzipSync(ping),Buffer.from('invalid trailing bytes')]),{'Content-Encoding':'gzip'});expect([200,400]).toContain(malformed.status);await malformed.text();
      await new Promise(r=>setTimeout(r,30));
      const healthy=await post(ping);expect(healthy.status).toBe(200);await healthy.text();
      expect(service.calls).toHaveLength(0);
    } finally {await mounted.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  });
  it('serves modern and legacy requests and sustained legitimate calls without a new rate quota', async () => {
    const h=await harness();
    try {
      const token=h.service.issue('owner');
      for(const {client} of [await h.modern(token),await h.legacy(token)]) {
        const result=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.sessions.list',arguments:{}}});
        expect(result.isError).not.toBe(true);
        const rows=Array.from({length:20000},()=>Object.fromEntries(Array.from({length:64},(_,n)=>['c'+n,0])));
        const imported=await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.dataset.import',arguments:{sessionId:'alpha',name:'Maximum-width dataset',rows}}});
        expect(imported.isError).not.toBe(true);
        expect(h.service.calls.at(-1)?.args.rows).toEqual(rows);
        for(let i=0;i<120;i++)expect((await client.callTool({name:'kanvas_call',arguments:{operationId:'kanvas.sessions.list',arguments:{}}})).isError).not.toBe(true);
      }
      // Use a valid large single string: byte limits must not silently revert to SDK's 4 MiB default.
      const payload={jsonrpc:'2.0',id:2,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'request-bounds-test',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}},padding:'x'.repeat(8*1024*1024)}};
      const response=await fetch(h.url,{method:'POST',headers:{...h.headers(token),'MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'},body:JSON.stringify(payload)});
      const responseText=await response.text();expect(response.status,responseText).toBe(200);
    } finally {await h.close();}
  }, 30000);
});
