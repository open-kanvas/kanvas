import {renderedView,paintedView} from './delivery-timing';
import {viewerTabId} from './window-identity';
import { useClientCapture } from './client-capture';
import { PointingLayer } from './pointing/PointingLayer';
import { useFilmstrip, FilmstripOverview } from './Filmstrip';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DisplayRecord, InteractionRecord, SessionConfig, ViewAction, VideoControlResult } from '../shared/types';
import { api, ApiError, displayPath, errorMessage, requestId, sessionPath } from './api';
import { useAuth, useMedia, useSession } from './hooks';
import { Icon, Wordmark } from './icons';
import { BrowsingProvider } from './renderers/Navigation';
import { Renderer } from './renderers/Renderer';
import {PushSettings} from './PushSettings';
import { ViewerExperience } from './ViewerExperience';
import { IdentifyOverlay } from './IdentifyOverlay';
import { sourceStatusText } from './monitoring-status';
import './monitoring.css';
import type { ViewerRoute } from './Auth';
import { MEDIA_FAILURES, type MediaFailureCode } from '../shared/media-failures';

/** Run after the next painted frame. Background tabs pause animation frames,
 * which previously left a rendered revision unacknowledged indefinitely. */
function afterPaint(callback: () => void): () => void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    const timer = setTimeout(callback, 0);
    return () => clearTimeout(timer);
  }
  let second = 0, done = false;
  const fallback = setTimeout(() => { if (!done) { done = true; cancelAnimationFrame(first); cancelAnimationFrame(second); callback(); } }, 1000);
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { if (!done) { done = true; clearTimeout(fallback); callback(); } }); });
  return () => { done = true; clearTimeout(fallback); cancelAnimationFrame(first); cancelAnimationFrame(second); };
}

export function Viewer({ sessionId, displayId }: ViewerRoute) {
  const auth = useAuth(), state = useSession(sessionId, displayId);
  const display = state.detail?.displays.find(item => item.id === displayId), config = state.detail?.session.config;
  useClientCapture(sessionId, displayId, Boolean(auth.user) && !auth.viewOnly && !auth.captureOnly && state.connection === 'live');
  const current = useRef(display); current.current = display;
  const shell = useRef<HTMLDivElement>(null);
  const strip=useFilmstrip(sessionId,displayId,display,!auth.captureOnly&&state.connection!=='closed'&&Boolean(display)&&config?.syncMode!=='presenter');
  const browsing=useRef(strip.active);browsing.current=strip.active;
  // A publication made while this viewer browses retained history must win:
  // otherwise the new revision can never paint, acknowledge or even time out.
  const browseBase=useRef<number|null>(null);
  useEffect(()=>{
    if(!strip.active){browseBase.current=null;return;}
    const revision=display?.revision??0;
    if(browseBase.current===null){browseBase.current=revision;return;}
    if(revision>browseBase.current){browseBase.current=null;strip.live();}
  },[strip.active,display?.revision]);
  const [menu, setMenu] = useState(false), [screenOptions, setScreenOptions] = useState(false), [notice, setNotice] = useState<string | null>(null), [failedRevision, setFailedRevision] = useState<number | null>(null);
  // Explicit sign-out failures must survive unrelated background-report notices.
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const logout = async () => {
    setLogoutError(null);
    try { await auth.logout(); } catch (error) { setLogoutError(errorMessage(error)); }
  };
  const [failureReason, setFailureReason] = useState<MediaFailureCode>('VIEW_RENDER_FAILED');
  const [paintedRevision, setPaintedRevision] = useState<number | null>(null);
  const [lastGood, setLastGood] = useState<{display: DisplayRecord; config?: SessionConfig} | null>(null);
  const [history, setHistory] = useState<{canGoBack: boolean; canGoForward: boolean} | null>(null);
  const [responseError, setResponseError] = useState<{revision: number; message: string} | null>(null);
  const [sourceClock, setSourceClock] = useState(Date.now);
  useEffect(() => {
    if (!display?.monitoring) return;
    setSourceClock(Date.now());
    const timer = setInterval(() => setSourceClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [display?.monitoring?.jobId, display?.monitoring?.nextPollAt]);
  const prefersDark = useMedia('(prefers-color-scheme: dark)');
  const theme = config?.theme === 'system' ? prefersDark ? 'dark' : 'light' : config?.theme ?? 'dark';
  const editable = !auth.viewOnly && (state.detail?.session.role === 'owner' || state.detail?.session.role === 'editor' || state.detail?.session.ownerId === auth.user?.id);
  const actionable = (!auth.viewOnly || auth.interactive) && !auth.captureOnly && state.connection !== 'closed';
  useEffect(() => {
    if (!menu || !editable || auth.captureOnly) return;
    const controller = new AbortController();
    void api<{canGoBack: boolean; canGoForward: boolean}>(`${displayPath(sessionId, displayId)}/history`, { signal: controller.signal }).then(setHistory).catch(() => {});
    return () => controller.abort();
  }, [menu, editable, display?.revision, sessionId, displayId, auth.captureOnly]);
  useEffect(() => { document.title = display ? `${display.name} · KANVAS` : 'KANVAS display'; return () => { document.title = 'KANVAS'; }; }, [display?.name]);
  useEffect(() => {
    if (!display || state.connection !== 'live' || auth.captureOnly) return;
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      // Mobile keyboards can shrink the visual viewport without resizing the layout viewport.
      // Preserve intentional pinch zoom, but keep normal-scale controls above the keyboard.
      if (shell.current && window.visualViewport && window.visualViewport.scale === 1) shell.current.style.setProperty('--viewer-height', `${window.visualViewport.height}px`);
      const rect = shell.current?.getBoundingClientRect(); if (!rect || rect.width < 1 || rect.height < 1 || disposed) return;
      void api(displayPath(sessionId, displayId), { method: 'PATCH', body: { width: Math.round(rect.width), height: Math.round(rect.height), pixelRatio: window.devicePixelRatio || 1 } }).catch(e => { if (!disposed) setNotice(errorMessage(e)); });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(report, 180); };
    const observer = new ResizeObserver(schedule); if (shell.current) observer.observe(shell.current);
    window.visualViewport?.addEventListener('resize', schedule); window.addEventListener('orientationchange', schedule); report();
    const heartbeat = setInterval(report, 30000);
    return () => { disposed = true; clearTimeout(timer); clearInterval(heartbeat); observer.disconnect(); window.visualViewport?.removeEventListener('resize', schedule); window.removeEventListener('orientationchange', schedule); shell.current?.style.removeProperty('--viewer-height'); };
  }, [Boolean(display), displayId, sessionId, state.connection === 'live', auth.captureOnly]);
  useEffect(() => {
    if (strip.active || !display || auth.captureOnly || display.revision === 0 || (display.view && paintedRevision !== display.revision) || failedRevision === display.revision || state.connection !== 'live' || display.appliedRevision === display.revision) return;
    const revision = display.revision;
    let disposed = false;
    const cancel = afterPaint(() => {
      if (!disposed) void api(`${displayPath(sessionId, displayId)}/applied`, { method: 'POST', body: { revision } }).catch(e => {
        if (disposed) return;
        // A newer publication can win the race with this acknowledgement. Refresh it;
        // the server must still reject the stale revision, but this is not an edit error.
        if (e instanceof ApiError && e.status === 409 && e.code === 'REVISION_CONFLICT') { void state.reload(); return; }
        setNotice(errorMessage(e));
      });
    });
    return () => { disposed = true; cancel(); };
  }, [display?.revision, display?.appliedRevision, display?.view, paintedRevision, failedRevision, sessionId, displayId, state.connection, state.reload, auth.captureOnly,strip.active]);
  useEffect(() => {
    if (state.connection === 'closed') { setLastGood(null); setPaintedRevision(null); }
    if (display && !display.view) setLastGood(null);
  }, [state.connection, display?.view]);
  const renderReady = (revision: number) => {
    if (browsing.current||current.current?.revision !== revision) return;
    renderedView(sessionId,displayId,revision);setFailedRevision(previous => previous === revision ? null : previous); setPaintedRevision(revision);
    setLastGood({ display: current.current, config });
  };
  const renderFailed = (revision: number, code: MediaFailureCode = 'VIEW_RENDER_FAILED') => {
    if (browsing.current||current.current?.revision !== revision) return;
    setFailedRevision(revision); setFailureReason(code);
    if (!auth.captureOnly) void api(`${displayPath(sessionId, displayId)}/delivery`, { method: 'POST', body: { revision, status: 'failed', code, ...(lastGood ? { lastGoodRevision: lastGood.display.revision } : {}) } }).catch(() => {});
  };
  useEffect(()=>{
    if(strip.active){window.dispatchEvent(new Event('kanvas:browsing'));return;}
    if(!display||auth.captureOnly||state.connection!=='live'||display.view&&paintedRevision!==display.revision)return;
    return afterPaint(()=>{if(!browsing.current){requestAnimationFrame(()=>requestAnimationFrame(()=>{const timing=paintedView(sessionId,displayId,display.revision);if(timing&&timing.visible&&!browsing.current)void api(`${displayPath(sessionId,displayId)}/paint-timing`,{method:'POST',body:{...timing,revision:display.revision,tabId:viewerTabId(),connection:state.connection}}).catch(()=>{});}));window.dispatchEvent(new CustomEvent('kanvas:painted',{detail:{sessionId,displayId,renderedRevision:display.revision}}));}});
  },[strip.active,display?.revision,paintedRevision,state.connection]);
  const returnLive=useRef(strip.live);returnLive.current=strip.live;
  useEffect(()=>{const go=()=>returnLive.current();window.addEventListener('kanvas:return-live',go);return()=>window.removeEventListener('kanvas:return-live',go);},[]);
  const readiness = useRef({ renderFailed }); readiness.current = { renderFailed };
  useEffect(() => {
    if (strip.active || !display?.view || display.revision === paintedRevision || display.revision === failedRevision) return;
    // A collaborative board intentionally waits for its local draft/conflict to
    // be resolved before acknowledging a newer shared revision. Keep that UI
    // visible and do not mistake the user's unsaved work for a renderer timeout.
    if (editable && display.view.template === 'whiteboard' && lastGood?.display.view?.template === 'whiteboard') return;
    const revision = display.revision;
    const timeout = setTimeout(() => readiness.current.renderFailed(revision), 35_000);
    return () => clearTimeout(timeout);
  }, [display?.revision, Boolean(display?.view), paintedRevision, failedRevision, editable, lastGood?.display.view?.template,strip.active]);
  const edit = useCallback(async (data: Record<string, unknown>, expectedRevision: number) => {
    // The draft owns its base revision. A refreshed display must never rebase an old edit.
    try { const saved = await api<DisplayRecord>(`${displayPath(sessionId, displayId)}/view`, { method: 'PATCH', body: { expectedRevision, data } }); await state.reload(); return saved.revision; }
    catch (e) { await state.reload(); throw e; }
  }, [sessionId, displayId, state.reload]);
  const responseFailed = async (revision: number, error: unknown): Promise<never> => {
    // A renderer can unmount while its request is in flight. Keep the failure
    // in the viewer too, so changing revision cannot erase the user's feedback.
    setResponseError({ revision, message: errorMessage(error) });
    await state.reload();
    throw error;
  };
  const action = async (item: ViewAction, value: unknown, revision: number) => {
    setResponseError(null);
    try {
      const interaction = await api<InteractionRecord>(`${sessionPath(sessionId)}/interactions`, { method: 'POST', body: { displayId, revision, actionId: item.id, value, requestId: requestId() } });
      await state.reload(); return interaction.id;
    } catch (error) { return responseFailed(revision, error); }
  };
  const respond = async (value: Record<string, unknown>, revision: number) => {
    setResponseError(null);
    try {
      const result = await api<InteractionRecord>(`${displayPath(sessionId, displayId)}/respond`, { method: 'POST', body: { revision, requestId: requestId(), value } }); await state.reload(); return result;
    } catch (error) { return responseFailed(revision, error); }
  };
  const videoResult = async (commandId: string, result: VideoControlResult) => {
    if (auth.captureOnly) return;
    await api(`${displayPath(sessionId, displayId)}/video-commands/${encodeURIComponent(commandId)}/result`, { method: 'POST', body: result }); await state.reload();
  };
  const navigate = async (direction: 'back'|'forward') => {
    if (!current.current || !editable) return;
    try { await api(`${sessionPath(sessionId)}/navigate`, { method: 'POST', body: { displayIds: [displayId], requestId: requestId(), expectedRevisions: { [displayId]: current.current.revision }, direction } }); await state.reload(); setMenu(false); }
    catch (e) { setNotice(errorMessage(e)); }
  };
  const hold = async () => {
    if (!editable || !current.current) return;
    try { await api(displayPath(sessionId, displayId), { method: 'PATCH', body: { held: !current.current.held, expectedRevision: current.current.revision } }); await state.reload(); } catch (e) { setNotice(errorMessage(e)); }
  };
  const stopMonitoring = async () => {
    const jobId = current.current?.monitoring?.jobId;
    if (!editable || !jobId) return;
    try {
      const job = await api<{version:number}>(`${sessionPath(sessionId)}/monitoring/${encodeURIComponent(jobId)}`);
      await api(`${sessionPath(sessionId)}/monitoring/${encodeURIComponent(jobId)}/stop`, { method: 'POST', body: { requestId: requestId(), expectedVersion: job.version } });
      await state.reload();
    } catch (error) { setNotice(errorMessage(error)); }
  };
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.current?.requestFullscreen(); setMenu(false); } catch { setNotice('Fullscreen is unavailable in this browser. The display still uses the available surface.'); } };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented||(event.target as HTMLElement).closest('input,textarea,select,button,a,.board-surface,[contenteditable="true"]') || event.metaKey || event.altKey || window.getSelection()?.toString()) return;
      if(event.ctrlKey){if(event.key==='Home'&&!auth.viewOnly){event.preventDefault();location.assign('/');}return;}
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void fullscreen(); }
      if (event.key === 'Escape') { setMenu(false); setScreenOptions(false); }
      if (event.key === '?') setMenu(value => !value);
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [auth.viewOnly]);
  useEffect(()=>{const el=shell.current;if(!el||auth.captureOnly)return;const control=(event:Event)=>{const action=(event as CustomEvent<string>).detail;
    if(action==='help'){location.assign('/docs/');return;}
    if(['menu','fullscreen','notifications'].includes(action)){setMenu(true);setScreenOptions(false);}
    else if(action==='options'){setMenu(false);setScreenOptions(true);}
    else if(action==='reconnect')state.reconnect();
    else if(action==='signout')void logout();
    else if(action==='home'&&!auth.viewOnly)location.assign('/');
    else if(config?.syncMode!=='presenter'){if(action==='overview')strip.positional.overview();else if(action==='live')strip.live();else if(action==='previous')strip.positional.step(-1);else if(action==='next')strip.positional.step(1);}
  };el.addEventListener('kanvas:screen-control',control);return()=>el.removeEventListener('kanvas:screen-control',control);},[auth,config?.syncMode,strip,state]);
  const isLoading = state.loading && !display, inaccessible = state.connection === 'closed' && Boolean(state.error), missing = !state.loading && !display && !state.error;
  const style = config?.accent && /^#[0-9a-fA-F]{6}$/.test(config.accent) ? { '--source-accent': config.accent } as CSSProperties : undefined;
  const draftKey = (value: DisplayRecord | undefined): string | undefined => {
    if (value?.view?.template === 'drafting') return `draft:${value.id}`;
    if (value?.view?.template === 'presentation') {
      const slides = value.view.data.slides as {template:string}[] | undefined, index = Number(value.view.data.index ?? 0);
      if (slides?.[index]?.template === 'drafting') return `draft:${value.id}:slide:${index}`;
    }
  };
  const sameNavigationRoot = Boolean(display?.view && lastGood?.display.view && (display.navigationRoot ?? display.revision) === (lastGood.display.navigationRoot ?? lastGood.display.revision) && display.view.template === lastGood.display.view.template);
  const preservingLocalState = failedRevision !== display?.revision && (sameNavigationRoot || Boolean(draftKey(display)) && draftKey(display) === draftKey(lastGood?.display)
    || editable && display?.view?.template === 'presentation' && lastGood?.display.view?.template === 'presentation'
    || editable && display?.view?.template === 'whiteboard' && lastGood?.display.view?.template === 'whiteboard'
    || display?.view?.template === 'table' && lastGood?.display.view?.template === 'table' && display.id === lastGood.display.id);
  const retaining = Boolean(!preservingLocalState && display?.view && lastGood?.display.view && lastGood.display.revision !== display.revision && paintedRevision !== display.revision);
  const renderStatus = inaccessible || missing ? 'unavailable' : failedRevision === display?.revision ? 'failed' : display && (!display.view || paintedRevision === display.revision) ? 'ready' : 'pending';
  const renderedRevision = retaining ? lastGood!.display.revision : display && !display.view ? display.revision : paintedRevision;
  const responseErrorShown = responseError && responseError.revision !== display?.revision && state.connection !== 'closed' && !auth.captureOnly;
  const sourceStatus = sourceStatusText(display?.monitoring, sourceClock, state.connection === 'live');
  const stageKey = (value: DisplayRecord) => draftKey(value) ?? (editable && value.view?.template === 'presentation' ? `presentation:${value.id}` : value.view?.template === 'table' ? `table:${value.id}` : editable && value.view?.template === 'whiteboard' ? 'collaborative-board' : `view:${value.navigationRoot ?? value.revision}:${value.view?.template}`);
  // Stage identity survives becoming last-good; its provider must not remount when primary changes.
  const stages = display?.view ? [
    ...(retaining && lastGood?.display.view ? [{...lastGood, primary: false, key: stageKey(lastGood.display) === stageKey(display) ? `fallback:${lastGood.display.revision}` : stageKey(lastGood.display)}] : []),
    {display, config, primary: true, key: stageKey(display)},
  ] : [];
  return <main ref={shell} className={`viewer-shell theme-${theme} ${menu ? 'viewer-menu-open' : ''}`} data-revision={display?.revision} data-rendered-revision={strip.active?strip.selected?.revision:renderedRevision??undefined} data-render-status={strip.active?'browsing':renderStatus} data-browsing-display={strip.active?(strip.selected?.displayId??displayId):undefined} data-browsing-revision={strip.active?(strip.selected?.revision??display?.revision):undefined} data-browsing-position={strip.active?Math.max(0,strip.position):undefined} data-browsing-total={strip.active?strip.frames.length:undefined} style={style}>
    {isLoading ? <div className="viewer-empty"><Wordmark compact /><span className="spinner" /><p>Connecting your display…</p></div> : inaccessible || missing ? <div className="viewer-empty viewer-unavailable"><Icon name="lock" size={35} /><h1>{missing ? 'Display not found.' : 'This display is unavailable.'}</h1><p>{state.error ?? 'Check the display address in your session workspace.'}</p>{!auth.viewOnly && <a href="/">Return to workspace <Icon name="arrow" size={17} /></a>}</div>  : strip.overview?<FilmstripOverview strip={strip}/>:strip.selected?<div className="viewer-candidate filmstrip-reading"><BrowsingProvider key={strip.selected.id} view={strip.selected.view} sessionId={sessionId} displayId={strip.selected.displayId} revision={strip.selected.revision} config={strip.selected.config} enabled={true} local initialPage={strip.initialPage} positional={menu||screenOptions?undefined:strip.positional}><Renderer view={strip.selected.view} sessionId={sessionId} displayId={strip.selected.displayId} revision={strip.selected.revision} config={strip.selected.config} editable={false} actionable={false}/></BrowsingProvider></div>: display?.view ? stages.map(stage => <div key={stage.key} className={stage.primary ? 'viewer-candidate' : 'viewer-last-good'} style={{ position: 'absolute', inset: 0, visibility: stage.primary && retaining ? 'hidden' : 'visible' }} aria-hidden={stage.primary && retaining || undefined}>
      <BrowsingProvider contentIdentity={stage.display.view?.template==='table'?undefined:stage.display.navigationRoot??stage.display.revision} positional={stage.primary&&!menu&&!screenOptions?strip.positional:undefined} view={stage.display.view!} sessionId={sessionId} displayId={displayId} revision={stage.display.revision} config={stage.config} enabled={stage.primary&&!auth.captureOnly&&state.connection==='live'&&!retaining&&renderStatus==='ready'}><Renderer sessionId={sessionId} displayId={displayId} configRevision={state.detail?.session.configRevision} onRefresh={state.reload} view={stage.display.view!} config={stage.config} preview={!stage.primary} editable={stage.primary && editable && state.connection === 'live' && !retaining} actionable={stage.primary && actionable && state.connection === 'live' && !retaining} revision={stage.display.revision} onEdit={stage.primary ? edit : undefined} onAction={stage.primary ? (item, value) => action(item, value, stage.display.revision) : undefined} onRespond={stage.primary ? (value, expectedRevision) => respond(value, expectedRevision ?? stage.display.revision) : undefined} responseState={stage.display.responseState} serverNow={stage.display.serverNow} videoCommand={stage.primary && !auth.captureOnly ? stage.display.videoCommand : undefined} onVideoCommandResult={stage.primary ? videoResult : undefined} onError={stage.primary ? code => renderFailed(stage.display.revision, code) : undefined} onReady={stage.primary ? () => renderReady(stage.display.revision) : undefined} renderIdentity={stage.display.revision} feedback={stage.primary ? state.detail?.interactions : undefined} /></BrowsingProvider>
    </div>) : <div className="viewer-empty"><Wordmark compact /><h1>{state.connection === 'offline' ? 'Reconnecting your display.' : 'Ready when you are.'}</h1><p>{state.connection === 'offline' ? state.error ?? 'The connection was interrupted.' : <>{display?.name ?? 'Your display'} is connected.<br />The next visual will appear here.</>}</p><span className="waiting-signal"><i />{state.connection === 'live' ? 'Waiting for content' : 'Connecting…'}</span>{!auth.captureOnly&&<p><a href="/docs/" target="_blank" rel="noopener noreferrer">Kanvas Help</a> · Choose a task without changing this screen.</p>}</div>}
    {(state.connection === 'offline' || display?.held || notice || logoutError || retaining || responseErrorShown) && <div className="viewer-status" role={responseErrorShown ? 'alert' : 'status'}>{state.connection === 'offline' && <span><Icon name="offline" size={14} />Offline · showing last received view</span>}{display?.held && <span><Icon name="pause" size={14} />Held · new content paused</span>}{retaining && <span>{failedRevision === display?.revision ? `${MEDIA_FAILURES[failureReason]} Showing the last successful view.` : 'Preparing the next view · previous view retained'}</span>}{responseErrorShown && <button onClick={() => setResponseError(null)} aria-label="Dismiss response error">{responseError.message}<Icon name="close" size={13} /></button>}{notice && !auth.captureOnly && <button onClick={() => setNotice(null)}>{notice}<Icon name="close" size={13} /></button>}{logoutError && !auth.captureOnly && <button onClick={() => setLogoutError(null)}>{logoutError}<Icon name="close" size={13} /></button>}</div>}
    {display && state.connection === 'live' && <ViewerExperience key={`${sessionId}:${displayId}`} sessionId={sessionId} display={display} shell={shell} enabled={!auth.captureOnly} browsing={strip.active} contribute={Boolean(actionable)&&!strip.active&&!retaining&&renderStatus==='ready'} optionsOpen={screenOptions} closeOptions={() => setScreenOptions(false)}/>}
    {display&&state.connection==='live'&&!auth.captureOnly&&<PointingLayer key={`pointing:${sessionId}:${display.id}`} shell={shell} sessionId={sessionId} display={display} ready={!strip.active&&!retaining&&renderStatus==='ready'}/>}
    {strip.active&&!strip.overview&&<div className="filmstrip-position" role="status"><span>{strip.position+1} / {strip.frames.length}</span><button onClick={()=>strip.setOverview(true)}>Overview</button><button onClick={strip.live}>Back to live</button></div>}
    {strip.error&&<div className="viewer-status" role="alert">{strip.error}</div>}
    {!auth.captureOnly && <button className="viewer-menu-toggle" onClick={() => { setMenu(!menu); setScreenOptions(false); }} aria-label="Display controls" aria-expanded={menu} title="Display controls (?)"><Icon name={menu ? 'close' : 'more'} size={21} /></button>}
    {sourceStatus && <div className="viewer-source-status" role="status">{sourceStatus}{display?.monitoring?.lastSuccessAt && <time dateTime={display.monitoring.lastSuccessAt}>Last success {new Date(display.monitoring.lastSuccessAt).toLocaleTimeString()}</time>}</div>}
    {menu && !auth.captureOnly && <div className="viewer-menu">
      <header><strong>{display?.name ?? 'Display'}</strong><span><i className={`connection-dot ${state.connection}`} />{state.connection}</span></header>
      <div className="viewer-menu-meta"><span>{display?.width} × {display?.height}</span><span>Revision {display?.revision ?? 0}</span>{auth.viewOnly && <span>{auth.interactive ? 'Guest · responses enabled' : 'Paired · view only'}</span>}</div>
      {!auth.viewOnly&&<a href="/">Home · choose a session</a>}
      <a href="/docs/" target="_blank" rel="noopener noreferrer">Kanvas Help</a>
      {display?.monitoring && <section className="viewer-monitoring"><strong>Source updates · {display.monitoring.status}</strong>{display.monitoring.nextPollAt && <p>Next check {new Date(display.monitoring.nextPollAt).toLocaleTimeString()}</p>}{editable && display.monitoring.status !== 'stopped' && <button onClick={() => void stopMonitoring()}>Stop source updates</button>}</section>}
      <button onClick={() => void fullscreen()}><Icon name="fullscreen" size={17} />{document.fullscreenElement ? 'Leave fullscreen' : 'Enter fullscreen'}<kbd>F</kbd></button>
      {display && state.connection === 'live' && <button onClick={() => { setMenu(false); setScreenOptions(true); }}><Icon name="screen" size={17} />Screen options</button>}
      {config?.syncMode!=='presenter'&&<><button disabled={strip.position<=0} onClick={()=>{strip.positional.step(-1);setMenu(false);}}>Previous view</button><button disabled={strip.position>=strip.frames.length-1} onClick={()=>{strip.positional.step(1);setMenu(false);}}>Next view</button><button onClick={()=>{strip.positional.overview();setMenu(false);}}>Session overview</button></>}
      {editable && <>
        <button onClick={() => void hold()}><Icon name={display?.held ? 'play' : 'pause'} size={17} />{display?.held ? 'Resume updates' : 'Hold this view'}</button>
      </>}
      <button onClick={() => { state.reconnect(); setMenu(false); }}><Icon name="refresh" size={17} />Refresh connection</button>
      {!auth.viewOnly&&<PushSettings compact/>}
      <button onClick={() => void logout()}><Icon name="logout" size={17} />Sign out of this screen</button>
    </div>}
    {!auth.captureOnly && <IdentifyOverlay sessionId={sessionId} displayId={displayId}/>}
  </main>;
}
