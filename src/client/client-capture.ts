import { useEffect } from 'react';
import { api, displayPath } from './api';
import { viewerTabId } from './renderers/Navigation';

interface Pending {captureId:string; expiresAt:number}
/** A remote message only arms this reviewed routine. getDisplayMedia is called
 * synchronously during a trusted click/keyboard activation, never from SSE or a
 * timer. Browsers retain complete control over their native share picker. */
export function installClientCapture(sessionId:string, displayId:string): () => void {
  const path = `${displayPath(sessionId, displayId)}/client-capture`, tabId = viewerTabId();
  let stopped = false, polling = false, repoll = false, pending:Pending|null = null, busy = false;
  let stream:MediaStream|undefined;
  const stoppedIds = new Set<string>();
  const stopStream = () => { stream?.getTracks().forEach(track => track.stop()); stream = undefined; };
  const report = async (item:Pending, status:string, data:Record<string,unknown>={}) => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try { return await api(`${path}/${encodeURIComponent(item.captureId)}`, {method:'POST',body:{tabId,status,...data},signal:controller.signal}); }
    finally { clearTimeout(timeout); }
  };
  const poll = async () => {
    if (stopped || busy || document.visibilityState === 'hidden') return;
    if (polling) { repoll = true; return; }
    polling = true;
    try {
      const item = await api<Pending|null>(`${path}?tabId=${encodeURIComponent(tabId)}`);
      if (stopped) return;
      pending = item && !stoppedIds.has(item.captureId) && item.expiresAt > Date.now() ? item : null;
      if (pending && (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia)) {
        const unsupported = pending; pending = null; stoppedIds.add(unsupported.captureId);
        await report(unsupported, 'unsupported');
      }
    } catch { pending = null; } finally { polling = false; if (repoll) { repoll = false; void poll(); } }
  };
  const activate = (event:Event) => {
    if (!event.isTrusted || !pending || busy || stopped || document.visibilityState === 'hidden') return;
    if (event instanceof KeyboardEvent && !['Enter',' '].includes(event.key)) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    const item = pending; pending = null;
    if (Date.now() >= item.expiresAt) return;
    busy = true; stoppedIds.add(item.captureId);
    // Sharing must end independently of any stalled network request or picker.
    let expired = false;
    const expiry = setTimeout(() => { expired = true; stopStream(); }, Math.max(0, item.expiresAt - Date.now()));
    if (stoppedIds.size > 100) stoppedIds.delete(stoppedIds.values().next().value!);
    // Do not await a network request before the browser's activation-gated call.
    let sharing:Promise<MediaStream>;
    try { sharing = navigator.mediaDevices.getDisplayMedia({video:true,audio:false}); }
    catch { clearTimeout(expiry); void report(item, 'unsupported').catch(() => {}); busy = false; return; }
    const permission = report(item, 'awaiting-permission');
    // Attach rejection handling immediately while the native picker is open.
    const permissionResult = permission.then(() => true, () => false);
    void (async () => {
      let video:HTMLVideoElement|undefined;
      try {
        stream = await sharing;
        if (stopped || expired || Date.now() >= item.expiresAt || !(await permissionResult)) return;
        if (stopped || expired || Date.now() >= item.expiresAt || !stream) return;
        video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
        await Promise.race([video.play(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Capture frame timeout')), 8000))]);
        if (stopped || Date.now() >= item.expiresAt || !video.videoWidth || !video.videoHeight) throw new Error('Capture expired');
        const scale = Math.min(1, 1920 / video.videoWidth, 1080 / video.videoHeight);
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d'); if (!context) throw new Error('Capture canvas unavailable');
        context.drawImage(video,0,0,canvas.width,canvas.height);
        // Stop sharing immediately after this single frame, before encoding/upload.
        stopStream();
        const base64 = canvas.toDataURL('image/jpeg',0.8).split(',')[1];
        if (!base64 || base64.length > 2_796_204) throw new Error('Capture exceeds two MiB');
        if (!stopped) await report(item, 'complete', {base64,width:canvas.width,height:canvas.height});
      } catch (error) {
        stopStream(); // Never keep sharing while reporting a failure to the server.
        // A fast native denial can beat the awaiting-permission request. Preserve
        // server state ordering instead of racing two contradictory reports.
        if (!stopped && await permissionResult) await report(item, error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'failed').catch(() => {});
      } finally {
        clearTimeout(expiry); stopStream();
        if (video) { video.pause(); video.srcObject = null; }
        busy = false;
      }
    })();
  };
  const change = (event:Event) => {
    const data = (event as CustomEvent).detail;
    if (data?.sessionId === sessionId && (!data.displayId || data.displayId === displayId)) void poll();
  };
  document.addEventListener('click', activate, true);
  document.addEventListener('keydown', activate, true);
  window.addEventListener('kanvas:session-change', change);
  const visible = () => { if (document.visibilityState === 'visible') void poll(); };
  document.addEventListener('visibilitychange', visible);
  // SSE is the primary signal; a quiet fallback recovers missed reconnects.
  const timer = setInterval(() => void poll(), 15000); void poll();
  return () => {
    stopped = true; pending = null; clearInterval(timer);
    stopStream();
    document.removeEventListener('click', activate, true); document.removeEventListener('keydown', activate, true);
    window.removeEventListener('kanvas:session-change', change);
    document.removeEventListener('visibilitychange', visible);
  };
}
export function useClientCapture(sessionId:string, displayId:string, enabled:boolean) {
  useEffect(() => enabled ? installClientCapture(sessionId, displayId) : undefined, [sessionId,displayId,enabled]);
}
