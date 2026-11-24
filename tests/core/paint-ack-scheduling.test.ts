import {afterEach,expect,it,vi} from 'vitest';
import {afterPaint} from '../../src/client/after-paint.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(hidden=false){
 const doc=Object.assign(new EventTarget(),{visibilityState:hidden?'hidden':'visible'}),frames=new Map<number,FrameRequestCallback>();let id=0;
 vi.stubGlobal('document',doc);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++id,cb);return id;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 return {doc,frames,frame(){const ready=[...frames.values()];frames.clear();ready.forEach(cb=>cb(0));}};
}
it('does not turn timer expiry or hidden-tab rendering into paint',()=>{vi.useFakeTimers();const f=fixture(true),callback=vi.fn(),cancel=afterPaint(callback);vi.advanceTimersByTime(5000);expect(callback).not.toHaveBeenCalled();expect(f.frames.size).toBe(0);f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));f.frame();expect(callback).not.toHaveBeenCalled();f.frame();expect(callback).toHaveBeenCalledOnce();cancel();});
it('cancels stale revision frames and suppresses ack if hidden between frames',()=>{const f=fixture(),callback=vi.fn(),cancel=afterPaint(callback);f.frame();f.doc.visibilityState='hidden';f.frame();expect(callback).not.toHaveBeenCalled();f.doc.visibilityState='visible';f.doc.dispatchEvent(new Event('visibilitychange'));cancel();f.frame();f.frame();expect(callback).not.toHaveBeenCalled();expect(f.frames.size).toBe(0);});
