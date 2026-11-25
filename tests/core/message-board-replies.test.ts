import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';

describe('one-level public board conversations', () => {
  let h: Harness, ada: {userId:string}, bo: {userId:string};
  beforeEach(async () => { h=await startHarness();ada={userId:(await h.account()).user!.id};bo={userId:(await h.account()).user!.id}; });
  afterEach(async () => { await h?.close(); });
  const call=(operation:string,args:Record<string,unknown>,principal=ada)=>h.runtime.service.execute(operation,args,principal) as Promise<any>;
  const post=(text:string,principal=ada,extra:Record<string,unknown>={})=>call('kanvas.board.post',{requestId:randomUUID(),text,acknowledgePublic:true,publicName:principal===ada?'Ada':'Bo',...extra},principal);
  it('pages matching replies without losing their parent, filters replies and refuses a second reply level', async () => {
    const parent=(await post('Original question',ada,{tags:['question']})).message;
    const first=(await post('First answer',bo,{replyTo:parent.id,tags:['answer']})).message;
    const second=(await post('Second answer',bo,{replyTo:parent.id,tags:['answer']})).message;
    const newest=await call('kanvas.board.read',{limit:1,tag:'answer'},ada);
    expect(newest.returned).toBe(1);
    expect(newest.contextParents).toBe(1);
    expect(newest.messages).toMatchObject([{id:parent.id,contextOnly:true,text:parent.text,replies:[{id:second.id,replyTo:parent.id}]}]);
    const older=await call('kanvas.board.read',{limit:1,tag:'answer',before:newest.nextCursor},ada);
    expect(older.messages[0].replies.map((m:any)=>m.id)).toEqual([first.id]);
    expect(older.nextCursor).toBeUndefined();
    const own=await call('kanvas.board.read',{mine:true},bo);
    expect(own.returned).toBe(2);
    expect(own.messages[0]).toMatchObject({id:parent.id,contextOnly:true,replies:[{id:first.id,mine:true},{id:second.id,mine:true}]});
    expect(own.messages[0].mine).toBeUndefined();
    const all=await call('kanvas.board.read',{},ada);
    expect(all.returned).toBe(3);
    expect(all.messages[0].contextOnly).toBeUndefined();
    expect(all.messages[0].replies.map((m:any)=>m.id)).toEqual([first.id,second.id]);
    await expect(post('Too deep',ada,{replyTo:first.id})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
    await expect(post('Missing parent',ada,{replyTo:'missing-parent'})).rejects.toMatchObject({code:'NOT_FOUND'});
    const overview=await call('kanvas.board.overview',{},bo);
    expect(validateView(overview.view).template).toBe('message-board');
    expect(overview.view.data.latest[0].replies).toHaveLength(2);
    expect(JSON.stringify(overview.view)).not.toMatch(/authorId|editedBy|postDigest|userId|mine/);
    const chat=await call('kanvas.board.read',{replyTo:parent.id,as:'chat'},ada);
    expect(validateView(chat.view).template).toBe('chat');
    expect(chat.view.data.messages.map((m:any)=>m.text)).toEqual(['Original question\n#question','↳ First answer\n#answer','↳ Second answer\n#answer']);
  });
  it('edits stable messages with a visible timestamp, retains request idempotency, and enforces author/admin authority', async () => {
    const requestId=randomUUID(),original=(await post('Typo',ada,{requestId,tags:['draft']})).message;
    await expect(call('kanvas.board.message.edit',{messageId:original.id,text:'Not mine'},bo)).rejects.toMatchObject({code:'NOT_FOUND'});
    const edit=await call('kanvas.board.message.edit',{messageId:original.id,text:'Corrected',tags:['Tips','tips']});
    expect(edit.message).toMatchObject({id:original.id,at:original.at,text:'Corrected',tags:['tips'],editedAt:expect.any(String)});
    expect((await call('kanvas.board.message.edit',{messageId:original.id,text:'Corrected',tags:['tips']})).message.editedAt).toBe(edit.message.editedAt);
    const repeated=await call('kanvas.board.post',{requestId,text:'Typo',tags:['draft']});
    expect(repeated).toMatchObject({repeated:true,message:{id:original.id,text:'Corrected',editedAt:edit.message.editedAt}});
    await expect(call('kanvas.board.post',{requestId,text:'New request payload',tags:['draft']})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    await expect(call('kanvas.board.message.edit',{text:'Missing identity'})).rejects.toBeTruthy();
    await expect(call('kanvas.board.message.edit',{messageId:original.id})).rejects.toBeTruthy();
    await expect(call('kanvas.board.message.edit',{messageId:original.id,removeMessageId:original.id,text:'Both'})).rejects.toBeTruthy();
    const admins=h.runtime.service.accounts as unknown as {serviceAdmins:Set<string>};admins.serviceAdmins.add(bo.userId);
    const admin=await call('kanvas.board.message.edit',{messageId:original.id,text:'Moderated'},bo);
    expect(admin.message).toMatchObject({id:original.id,at:original.at,text:'Moderated',editedAt:expect.any(String)});
    expect(await h.runtime.store.get<any>('board-message',original.id)).toMatchObject({editedBy:'maintainer'});
    const read=await call('kanvas.board.read',{as:'chat'},bo);
    expect(read.messages[0].editedAt).toBe(admin.message.editedAt);
    expect(read.view.data.messages[0].text).toContain(`edited ${admin.message.editedAt}`);
    await call('kanvas.board.message.delete',{messageId:original.id},bo);
    expect((await call('kanvas.board.read',{},ada)).messages).toEqual([]);
  });
  it('keeps another author’s replies when a parent is removed or erased, without leaking removed text or inventing a time', async () => {
    const parent=(await post('Private-in-removal original')).message;
    const answer=(await post('Keep this answer',bo,{replyTo:parent.id})).message;
    await call('kanvas.board.message.delete',{messageId:parent.id});
    let read=await call('kanvas.board.read',{},bo);
    expect(read.messages).toMatchObject([{id:parent.id,removed:true,contextOnly:true,replies:[{id:answer.id,text:'Keep this answer'}]}]);
    expect(JSON.stringify(read)).not.toContain('Private-in-removal original');
    await expect(post('Reply after removal',bo,{replyTo:parent.id})).rejects.toMatchObject({code:'NOT_FOUND'});
    await h.runtime.service.board.forgetAccount(ada.userId);
    read=await call('kanvas.board.read',{},bo);
    expect(read.messages[0].at).toBeUndefined();
    expect(read.messages[0].replies[0].at).toBe(answer.at);
    const overview=await call('kanvas.board.overview',{},bo);
    expect(validateView(overview.view).template).toBe('message-board');
    expect(overview.total).toBe(1);
    expect(overview.latestAt).toBe(answer.at);
  });
});

describe('narrow public board mutation contracts',()=>{
 it('rejects cross-operation fields and requires message identity and edit content',async()=>{
  const {boardTools}=await import('../../src/server/message-board.js');
  const cases:[string,Record<string,unknown>,Record<string,unknown>[]][]=[
   ['kanvas.board.preferences.update',{notifications:true},[{markSeen:true},{messageId:'m',text:'edit'},{removeMessageId:'m'},{action:'delete'}]],
   ['kanvas.board.messages.seen',{},[{notifications:true},{publicName:'Ada'},{messageId:'m'},{markSeen:true},{action:'delete'}]],
   ['kanvas.board.message.edit',{messageId:'m',text:'edit'},[{notifications:true},{publicName:'Ada'},{markSeen:true},{removeMessageId:'m'},{action:'delete'}]],
   ['kanvas.board.message.delete',{messageId:'m'},[{notifications:true},{publicName:'Ada'},{markSeen:true},{text:'edit'},{tags:[]},{action:'edit'}]],
  ];
  expect(boardTools.some(op=>op.name==='kanvas.board.update')).toBe(false);
  for(const [name,valid,extras] of cases){const schema=boardTools.find(op=>op.name===name)!.schema;expect(schema.safeParse(valid).success).toBe(true);for(const extra of extras)expect(schema.safeParse({...valid,...extra}).success,JSON.stringify([name,extra])).toBe(false);}
  expect(boardTools.find(op=>op.name==='kanvas.board.preferences.update')!.schema.safeParse({}).success).toBe(false);
  expect(boardTools.find(op=>op.name==='kanvas.board.message.edit')!.schema.safeParse({messageId:'m'}).success).toBe(false);
  expect(boardTools.find(op=>op.name==='kanvas.board.message.delete')!.schema.safeParse({}).success).toBe(false);
  expect(boardTools.find(op=>op.name==='kanvas.board.message.delete')!.destructive).toBe(true);
 });
 it('isolates preferences and seen state and enforces full-account publish access for all four mutations',async()=>{
  const h=await startHarness();try{
   const a=await h.account(),b=await h.account(),pa={userId:a.user!.id},pb={userId:b.user!.id},board=h.runtime.service.board;
   const posted:any=await board.post(pa,{requestId:'isolation',text:'Original',acknowledgePublic:true,publicName:'Ada'});
   await board.updatePreferences(pb,{notifications:true,publicName:'Bo'});
   expect((await board.overview(pb,{})).newCount).toBe(1);
   await board.markMessagesSeen(pb,{});
   expect((await board.overview(pb,{}))).toMatchObject({newCount:0,you:{notifications:true,publicName:'Bo'}});
   await expect(board.updatePreferences(pb,{publicName:'Kanvas maintainer'})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
   await expect(board.updatePreferences(pb,{notifications:false,messageId:posted.message.id})).rejects.toBeDefined();
   expect((await board.overview(pb,{})).you.notifications).toBe(true);
   const token=await h.runtime.auth.issueToken(b.user!.id,'read-only',['read']);
   const restricted={userId:b.user!.id,tokenId:token.token.id};
   const selected=await h.runtime.auth.issueToken(b.user!.id,'selected',['read','publish'],[(await b.session()).id]);
   for(const p of [restricted,{...pb,tokenId:selected.token.id},{...pb,scopedSessionId:'narrowed'}]){
    await expect(board.updatePreferences(p,{notifications:false})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(board.markMessagesSeen(p,{})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(board.editMessage(p,{messageId:posted.message.id,text:'No'})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(board.deleteMessage(p,{messageId:posted.message.id})).rejects.toMatchObject({code:'FORBIDDEN'});
   }
   expect((await board.read(pa,{})).messages[0].text).toBe('Original');
  }finally{await h.close();}
 });
});
