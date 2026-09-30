/** Non-secret tab address shared by navigation, presence and the device receiver.
 * sessionStorage survives reloads; an origin lock prevents duplicated tabs from
 * sharing the copied address. Authority still comes from the browser session. */
let identity:string|undefined;
let initialized:Promise<void>|undefined;
export const viewerTabId=()=>identity??=crypto.randomUUID();
const storageKey='kanvas-window-identity';
export function initializeWindowIdentity():Promise<void>{
  return initialized??= (async()=>{
    let candidate:string|undefined;
    try{const stored=sessionStorage.getItem(storageKey);if(stored&&/^[A-Za-z0-9_-]{1,128}$/.test(stored))candidate=stored;}catch{/* Storage may be disabled. */}
    candidate??=viewerTabId();
    if(navigator.locks){
      for(let attempt=0;attempt<3;attempt++){
        const claimed=await new Promise<boolean>(resolve=>{
          void navigator.locks.request('kanvas-window:'+candidate,{ifAvailable:true},lock=>{
            if(!lock){resolve(false);return;}
            resolve(true);
            // The browser releases this when the document is destroyed. Holding
            // a lock also prevents an old BFCache document becoming a duplicate.
            return new Promise<void>(()=>{});
          }).catch(()=>resolve(false));
        });
        if(claimed)break;
        candidate=crypto.randomUUID();
      }
    }else if(typeof BroadcastChannel!=='undefined'){
      const channel=new BroadcastChannel('kanvas-window-addresses'),nonce=crypto.randomUUID();let occupied=false;
      channel.onmessage=event=>{const message=event.data;
        if(message?.id!==candidate)return;
        if(message.type==='probe'&&message.nonce!==nonce)channel.postMessage({type:'occupied',id:candidate,nonce:message.nonce});
        if(message.type==='occupied'&&message.nonce===nonce)occupied=true;
      };
      channel.postMessage({type:'probe',id:candidate,nonce});
      await new Promise(resolve=>setTimeout(resolve,80));
      if(occupied)candidate=crypto.randomUUID();
      window.addEventListener('pagehide',()=>channel.close(),{once:true});
    }else candidate=crypto.randomUUID();
    identity=candidate;
    try{sessionStorage.setItem(storageKey,identity);}catch{/* In-memory identity remains independent. */}
  })();
}
