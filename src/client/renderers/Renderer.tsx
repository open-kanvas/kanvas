import { Instrument } from './Instrument';
import { instrumentDataSchema } from '../../shared/instrument';
import { LiveCaptions } from './LiveCaptions';
import { captionDataSchema } from '../../shared/local-sequence';
import type {MathWorkspace} from '../../shared/math-workspace';
import {VennRenderer} from './Venn';
import type {VennData} from '../../shared/statistical-visuals';
import {MoleculeRenderer} from './Molecule';
import {Scene3DRenderer} from './Scene3D';
import {SignageRenderer} from './Signage';
import { GameRenderer } from './Game';
import type { GameData } from '../../shared/game';
import {SatisfactionRenderer} from './Satisfaction';
import {CatalogList} from './CatalogList';
import {useDevice} from '../DeviceReceiver';
import {FitToDisplay} from './FitToDisplay';
import {VenueRenderer} from './Venue';
import {VENUE_IDS} from '../../shared/venue';
import {staticPreviewDocument} from '../../shared/device-preview';
import {diagnostic} from '../frontend-diagnostics';
import { FlashcardsRenderer } from './Flashcards';
import { DevicePreview } from './DevicePreview';
import { DiagramRenderer, SportsLineupRenderer } from './Diagrams';
import { useInternalNavigation } from './Navigation';
import { ImageGallery } from './ImageGallery';
import type { GalleryData } from '../../shared/image-gallery';
import type { SessionTopology } from '../../shared/accounts';
import { Scoreboard,Standings,ToolCallLog } from './EventViews';
import type { ToolCall } from '../../shared/event-views';
import { JsonExplorer } from './JsonExplorer';
import { SessionTopologyRenderer } from './SessionTopology';
import type { TopologyData } from '../../shared/connection-views';
import { ImageFallbackContext } from './ImageFallback';
import { WorkRenderer } from './WorkViews';
import { WORK_TEMPLATE_IDS } from '../../shared/work-views';
import { projectSelection } from '../../shared/selection';
import { SelectionContext } from './Selection';
import { ProgressRenderer, LogRenderer } from './TaskViews';
import type { ProgressData } from '../../shared/task-views';
import { Component, Suspense, lazy, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InteractionRecord, SessionConfig, TemplateResponseState, VideoControlCommand, VideoControlResult, ViewAction, ViewSpec } from '../../shared/types';
import { api, displayPath, requestId, errorMessage } from '../api';
import { MediaReadyGate } from './readiness';
import type { MediaFailureCode } from '../../shared/media-failures';
import { ExtendedRenderer } from './Extended';
import { SessionOverview, SessionSettings } from './SessionControls';
import { Icon } from '../icons';
import { ChartRenderer, TableRenderer, type ChartData, type TableData } from './Chart';
import { CodeRenderer, type CodeData } from './Code';
import { ChecklistRenderer, ComparisonRenderer, DocumentRenderer, FactRenderer, ImageRenderer, NotificationsRenderer, NumberRenderer, VideoRenderer, WebRenderer, type ChecklistData, type DocumentData, type ImageEntry, type NotificationsData, type VideoData } from './Content';
import WhiteboardRenderer, { type WhiteboardData } from './Whiteboard';
import type { MapData } from './Map';
import { TranscriptionRenderer, TranslationRenderer } from './Text';
import { CountdownRenderer, ScheduleRenderer } from './Time';
import { FormRenderer, PollRenderer, QARenderer } from './Participation';
import { hasViewInformation, liveSurfaceLayout, liveSurfaceOptions, viewInformationContent } from '../../shared/live-surface';
import { ViewInformation } from './ViewInformation';
import { DraftingRenderer } from './Drafting';
import { ClockRenderer } from './Clock';
import { NowPlayingRenderer } from './NowPlaying';
import { RosterRenderer } from './Roster';
import { DisplayGridRenderer } from './DisplayGrid';
import { DevicesRenderer } from './Devices';
import { CalendarRenderer, PlannerRenderer } from './Planner';
import './glance.css';
import { RegionalContext } from './Regional';
import { ListRenderer, IframeRenderer } from './Browsing';
import type { IframeData, ListData } from '../../shared/browsing-templates';
import type { CountdownData, FormData, PollData, QAData, ScheduleData, TranscriptionData, TranslationData } from '../../shared/view-schemas';
const MathWorkspaceRenderer = lazy(() => import('./MathWorkspace').then(m => ({default:m.MathWorkspaceRenderer})));
const MapRenderer = lazy(() => import('./Map'));

export interface RendererProps {
  publicToolCalls?:ToolCall[];
  publicTopology?:SessionTopology;

  sessionId?: string; displayId?: string; configRevision?: number; onRefresh?: () => Promise<unknown>;
  view: ViewSpec;
  config?: SessionConfig;
  editable?: boolean;
  actionable?: boolean;
  preview?: boolean;
  revision?: number;
  onEdit?: (data: Record<string, unknown>, expectedRevision: number) => Promise<number>;
  onAction?: (action: ViewAction, value: unknown) => Promise<string | void>;
  onRespond?: (value: Record<string, unknown>, expectedRevision?: number) => Promise<unknown>;
  responseState?: TemplateResponseState;
  serverNow?: string;
  videoCommand?: VideoControlCommand;
  onVideoCommandResult?: (id: string, result: VideoControlResult) => Promise<unknown>;
  onError?: (code?: MediaFailureCode) => void;
  onReady?: () => void;
  renderIdentity?: number | string;
  feedback?: InteractionRecord[];
  containerView?: ViewSpec;
}
class RenderBoundary extends Component<{ children: ReactNode; identity: unknown; onError?: () => void }, { failed: boolean; identity: unknown }> {
  state = { failed: false, identity: this.props.identity };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { identity: unknown }, state: { identity: unknown }) { return props.identity !== state.identity ? { failed: false, identity: props.identity } : null; }
  componentDidCatch() { diagnostic({event:'render-error'}); this.props.onError?.(); }
  render() { return this.state.failed ? <div className="content-empty" role="alert"><Icon name="refresh" size={30} /><p>This view could not be displayed.</p><span>The submitted content is saved; try another view.</span></div> : this.props.children; }
}
export function Renderer(props: RendererProps) {
  const receiver=useDevice();
  const { view, config, preview } = props;
  const surface = liveSurfaceOptions(view, props.containerView);
  const layout = liveSurfaceLayout(view);
  const hasInformation = !preview && view.template !== 'presentation' && surface.showSource && hasViewInformation(view, props.containerView);
  const hasMedia = (view.template==='table'&&(view.data.cellStyles as {indicator?:{kind:string}}[]|undefined)?.some(s=>s.indicator?.kind==='image')) || ['todays-special','menu-board','opening-hours','back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign','itinerary','comparison','story-cards','scoreboard','standings','image-gallery','overview', 'image', 'web', 'website', 'iframe', 'document', 'video', 'product', 'profile', 'quote', 'recipe', 'leaderboard', 'menu', 'join', 'now-playing'].includes(view.template);
  const accent = config?.accent && /^#[0-9a-fA-F]{6}$/.test(config.accent) ? config.accent : undefined;
  return <RegionalContext.Provider value={{...config,...view.format}}><ImageFallbackContext.Provider value={{sessionId:props.sessionId,displayId:props.displayId,revision:props.revision,preview:props.preview}}><section className={`render-surface template-${view.template} ${layout.mode === 'reading' || layout.mode === 'interactive' ? 'is-reference' : 'is-glance'} ${preview ? 'is-preview' : 'is-live'} ${layout.fullBleed ? 'is-full-bleed' : ''} ${hasInformation ? 'has-view-information' : ''}`} data-device-kind={props.preview?undefined:receiver.device?.context?.device} data-surface-mode={layout.mode} data-show-caption={surface.showCaption} data-show-controls={surface.showControls} style={accent ? { '--source-accent': accent } as CSSProperties : undefined} aria-label={view.title ?? `${view.template} display`}>
    {config?.branding && !preview && <div className="session-branding">{config.branding.logoUrl&&<img src={`${config.branding.logoUrl}?sessionId=${encodeURIComponent(props.sessionId??'')}&displayId=${encodeURIComponent(props.displayId??'')}`} alt={`${config.branding.name??'Organization'} logo`}/>}<span>{config.branding.name}</span><span className="brand-palette">{config.branding.palette.map((color,index)=><i key={index} style={{background:color}}/>)}</span></div>}
    {surface.showTitle && <header className="view-heading"><h1>{view.title}</h1></header>}
    <div className="render-body"><RenderBoundary identity={props.renderIdentity ?? JSON.stringify(view)} onError={props.onError}><Suspense fallback={<LoadingView onError={props.onError} />}>{hasMedia ? <MediaReadyGate key={props.renderIdentity ?? JSON.stringify(view)} onReady={props.onReady} onError={props.onError}><Content {...props} /></MediaReadyGate> : <Content {...props} />}{!hasMedia && !['scene3d','account-template','presentation', 'map', 'whiteboard', 'html', 'device-preview', 'session-topology'].includes(view.template) && <ReadyProbe identity={props.renderIdentity ?? JSON.stringify(view)} onReady={props.onReady} />}</Suspense></RenderBoundary></div>
    {!!view.actions?.length && !preview && !['email','inbox','chat'].includes(view.template) && <ActionControls actions={view.actions} enabled={props.actionable ?? false} onAction={props.onAction} feedback={props.feedback} />}
    {hasInformation && <ViewInformation key={props.renderIdentity ?? JSON.stringify(view)} view={view} container={props.containerView} preview={preview}/>}
  </section></ImageFallbackContext.Provider></RegionalContext.Provider>;
}
function LoadingView({ onError }: { onError?: () => void }) {
  const callback = useRef(onError); callback.current = onError;
  useEffect(() => { const timeout = setTimeout(() => callback.current?.(), 15_000); return () => clearTimeout(timeout); }, []);
  return <div className="content-empty" role="status"><span className="spinner" /><span>Loading view…</span></div>;
}
function ReadyProbe({ identity, onReady }: { identity: unknown; onReady?: () => void }) {
  const callback = useRef(onReady); callback.current = onReady;
  useEffect(() => { callback.current?.(); }, [identity]);
  return null;
}
function Content(props: RendererProps) {
  if(['seat-map','menu','menu-board','todays-special','opening-hours','back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign'].includes(props.view.template))return <FitToDisplay><ContentInner {...props}/></FitToDisplay>;
  return <ContentInner {...props}/>;
}
function ContentInner(props: RendererProps) {
  const { view, config, editable, onEdit } = props;
  if(view.selection){const projected=projectSelection(view);return <SelectionContext.Provider value={projected}><Content {...props} view={projected.view}/></SelectionContext.Provider>;}
  const data = view.data;
  if(view.template==='game-board')return <GameRenderer data={data as GameData}/>;
  if((VENUE_IDS as readonly string[]).includes(view.template))return <VenueRenderer {...props}/>;
  if(view.template==='account-template')return <iframe title={view.title??'Custom template'} sandbox="" referrerPolicy="no-referrer" className="venue-poster-frame" onLoad={()=>props.onReady?.()} srcDoc={staticPreviewDocument(String(data.html??''),String(data.css??''))}/>;
  if((WORK_TEMPLATE_IDS as readonly string[]).includes(view.template))return <WorkRenderer {...props}/>;
  const surface = liveSurfaceOptions(view, props.containerView);
  switch (view.template) {
    case 'scoreboard':return <Scoreboard {...props}/>;
    case 'standings':return <Standings {...props}/>;
    case 'tool-call-log':return <ToolCallLog {...props}/>;
    case 'json': return <JsonExplorer data={data as {json:string;expandedDepth?:number}}/>;
    case 'session-topology': return <SessionTopologyRenderer publicSnapshot={props.publicTopology} sessionId={props.sessionId} displayId={props.displayId} data={data as TopologyData} preview={props.preview} onReady={props.onReady} onError={props.onError} renderIdentity={props.renderIdentity}/>;
    case 'progress': return <ProgressRenderer data={data as ProgressData}/>;
    case 'log': return <LogRenderer {...props}/>;
    case 'scene3d': return <Scene3DRenderer {...props} />;
    case 'drafting': return <DraftingRenderer {...props} />;
    case 'molecule': return <MoleculeRenderer view={view} />;
    case 'signage': return <SignageRenderer view={view} serverNow={props.serverNow} />;
    case 'satisfaction': return <SatisfactionRenderer {...props} />;
    case 'clock': return <ClockRenderer {...props} />;
    case 'now-playing': return <NowPlayingRenderer {...props} />;
    case 'roster': return <RosterRenderer {...props} />;
    case 'overview': return <SessionOverview {...props}/>;
    case 'display-grid': return <DisplayGridRenderer {...props}/>;
    case 'catalog-list': return <CatalogList {...props}/>;
    case 'devices': return <DevicesRenderer {...props}/>;
    case 'sports-lineup': return <SportsLineupRenderer {...props}/>;
    case 'device-preview': return <DevicePreview {...props}/>;
    case 'architecture': case 'org-chart': case 'flowchart': case 'network': return <DiagramRenderer {...props}/>;
    case 'calendar': return <CalendarRenderer {...props} />;
    case 'planner': return <PlannerRenderer {...props} actionable={props.actionable && !props.preview} />;
    case 'settings': return <SessionSettings {...props}/>;
    case 'fact': return <FactRenderer {...surface} data={data as unknown as { text: string }}  />;
    case 'number': return <NumberRenderer {...surface} data={data as unknown as { value: string | number }} />;
    case 'math': return <MathWorkspaceRenderer data={data as unknown as MathWorkspace}/>;
    case 'venn': return <VennRenderer data={data as unknown as VennData}/>;
    case 'chart': return <ChartRenderer {...surface} data={data as unknown as ChartData} />;
    case 'table': return <TableRenderer {...surface} data={data as unknown as TableData} />;
    case 'image-gallery':return <ImageGallery data={data as GalleryData}/>;
    case 'image': return <ImageRenderer {...surface} data={data as unknown as { images: ImageEntry[] }} />;
    case 'website':
    case 'iframe': return <IframeRenderer data={data as unknown as IframeData} preview={props.preview} sessionId={props.sessionId} displayId={props.displayId} revision={props.revision}/>;
    case 'list': return <ListRenderer data={data as unknown as ListData}/>;
    case 'web': return <WebRenderer {...surface} data={data as unknown as { url: string }} sessionId={props.sessionId} displayId={props.displayId} revision={props.revision} preview={props.preview} />;
    case 'comparison': return <ComparisonRenderer {...surface} data={data as unknown as Parameters<typeof ComparisonRenderer>[0]['data']} />;
    case 'flashcards': return <FlashcardsRenderer {...props}/>;
    case 'checklist': return <ChecklistRenderer {...surface} data={data as unknown as ChecklistData} editable={editable} revision={props.revision} onEdit={onEdit} actionable={props.actionable && !props.preview} onRespond={props.onRespond} />;
    case 'map': return <MapRenderer {...surface} data={data as unknown as MapData} onReady={props.onReady} onError={props.onError} renderIdentity={props.renderIdentity} />;
    case 'code': return <CodeRenderer {...surface} data={data as unknown as CodeData} />;
    case 'whiteboard': return <WhiteboardRenderer {...surface} data={data as unknown as WhiteboardData} editable={editable} revision={props.revision} onEdit={onEdit} onReady={props.onReady} onError={props.onError} />;
    case 'presentation': return <PresentationRenderer {...props} />;
    case 'document': return <DocumentRenderer preview={props.preview} {...surface} data={data as unknown as DocumentData} />;
    case 'video': return <VideoRenderer {...surface} data={data as unknown as VideoData} revision={props.revision} command={props.preview ? undefined : props.videoCommand} serverNow={props.serverNow} preview={props.preview} onCommandResult={props.onVideoCommandResult} />;
    case 'notifications': return <NotificationsRenderer {...surface} data={data as unknown as NotificationsData} editable={editable} revision={props.revision} onEdit={onEdit} />;
    case 'instrument': return <Instrument data={instrumentDataSchema.parse(data)} serverNow={props.serverNow} preview={props.preview} />;
    case 'live-captions': return <LiveCaptions data={captionDataSchema.parse(data)} serverNow={props.serverNow} preview={props.preview} />;
    case 'transcription': return <TranscriptionRenderer {...surface} data={data as unknown as TranscriptionData} />;
    case 'translation': return <TranslationRenderer {...surface} data={data as unknown as TranslationData} />;
    case 'form': return <FormRenderer key={props.renderIdentity ?? props.revision ?? JSON.stringify(data)} data={data as unknown as FormData} actionable={props.actionable} preview={props.preview} onRespond={props.onRespond} responseState={props.responseState} />;
    case 'schedule': return <ScheduleRenderer {...surface} data={data as unknown as ScheduleData} />;
    case 'poll': return <PollRenderer key={props.renderIdentity ?? props.revision ?? JSON.stringify(data)} data={data as unknown as PollData} actionable={props.actionable} preview={props.preview} onRespond={props.onRespond} responseState={props.responseState} />;
    case 'countdown': return <CountdownRenderer {...surface} data={data as unknown as CountdownData} serverNow={props.serverNow} preview={props.preview} />;
    case 'qa': return <QARenderer key={props.renderIdentity ?? props.revision ?? JSON.stringify(data)} data={data as unknown as QAData} actionable={props.actionable} preview={props.preview} onRespond={props.onRespond} responseState={props.responseState} />;
    default: return <ExtendedRenderer {...props} />;
  }
}
function PresentationRenderer(props: RendererProps) {
  const data = props.view.data as unknown as { slides: ViewSpec[]; index?: number; presenterPreview?: boolean;mirrored?:boolean|'vertical'|'horizontal'|'both';cueMode?:boolean };
  const liveIndex = Math.min(Math.max(data.index ?? 0, 0), data.slides.length - 1);
  const [privateIndex, setPrivateIndex] = useState<number | null>(() => data.presenterPreview ? liveIndex : null);
  const deckKey = JSON.stringify(data.slides);
  useEffect(() => { setPrivateIndex(data.presenterPreview ? liveIndex : null); }, [deckKey, data.presenterPreview]);
  const index = privateIndex === null ? liveIndex : Math.min(privateIndex, data.slides.length - 1);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const canNavigate = Boolean(props.editable && (props.onRespond || props.onEdit) && props.revision !== undefined);
  const showNavigation = !props.preview && (data.presenterPreview || liveSurfaceOptions(props.view, props.containerView).showControls);
  const change = async (next: number, goLive = false) => {
    if (busy || !canNavigate || props.revision === undefined || next < 0 || next >= data.slides.length || next === (goLive ? liveIndex : index)) return;
    if (!goLive && privateIndex !== null) { setPrivateIndex(next); return; }
    setBusy(true); setError(null);
    try { if (props.onRespond) await props.onRespond({ kind: 'presentation.navigate', index: next }); else await props.onEdit!({ ...props.view.data, index: next }, props.revision); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  useInternalNavigation(direction => {
    if (!canNavigate) return false;
    const next = index + direction;
    if (next < 0 || next >= data.slides.length) return false;
    void change(next); return true;
  });
  if (!data.slides.length) return <div className="content-empty">This presentation has no slides.</div>;
  return <div className="presentation-content" ref={container} tabIndex={canNavigate ? 0 : undefined} data-presenter-preview={privateIndex !== null} aria-label={`Presentation, slide ${index + 1} of ${data.slides.length}`}>
    <div className="presentation-slide" style={data.mirrored?{transform:data.mirrored==='horizontal'?'scaleX(-1)':data.mirrored==='both'?'scale(-1, -1)':'scaleY(-1)'}:undefined}><Renderer containerView={props.view} sessionId={props.sessionId} displayId={props.displayId} configRevision={props.configRevision} onRefresh={props.onRefresh} view={data.slides[index]} config={props.config} preview={props.preview} editable={privateIndex === null && Boolean(props.editable)&&['overview','settings','procedure','recipe'].includes(data.slides[index].template)} actionable={privateIndex === null && props.actionable} revision={props.revision} onAction={privateIndex === null ? props.onAction : undefined} onRespond={privateIndex === null ? props.onRespond : undefined} responseState={props.responseState} serverNow={props.serverNow} videoCommand={props.videoCommand} onVideoCommandResult={props.onVideoCommandResult} onReady={props.onReady} onError={props.onError} renderIdentity={`${props.renderIdentity ?? JSON.stringify(props.view)}:${index}`} /></div>
    {showNavigation && <div className="presentation-controls">{canNavigate && data.slides.length > 1 && <button aria-label="Previous slide" disabled={busy || index === 0} onClick={() => void change(index - 1)}>←</button>}<span>{index + 1}<i>/</i>{data.slides.length}</span>{canNavigate && data.slides.length > 1 && <button aria-label="Next slide" disabled={busy || index === data.slides.length - 1} onClick={() => void change(index + 1)}>→</button>}</div>}
    {!props.preview && data.presenterPreview && canNavigate && <div className="presenter-preview-controls" role="group" aria-label="Presenter preview">
      <span role="status">Live: {liveIndex + 1} · {privateIndex === null ? 'Following live' : `Private preview: ${index + 1}`}</span>
      {privateIndex === null ? <button onClick={() => setPrivateIndex(liveIndex)}>Preview privately</button> : <><button disabled={busy || index === liveIndex} onClick={() => void change(index, true)}>Go live</button><button onClick={() => setPrivateIndex(null)}>Follow live</button></>}
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
function ActionControls({ actions, enabled, onAction, feedback }: { actions: ViewAction[]; enabled: boolean; onAction?: RendererProps['onAction']; feedback?: InteractionRecord[] }) {
  const [pending, setPending] = useState<string | null>(null), [sent, setSent] = useState<{ actionId: string; id?: string } | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { setSent(null); setError(null); }, [actions]);
  const submit = async (action: ViewAction, value: unknown) => {
    if (!enabled || !onAction || pending) return;
    setPending(action.id); setError(null); setSent(null);
    try { const id = await onAction(action, value); setSent({ actionId: action.id, id: typeof id === 'string' ? id : undefined }); } catch (e) { setError(errorMessage(e)); } finally { setPending(null); }
  };
  const acknowledged = sent?.id && feedback?.some(item => item.id === sent.id && item.status === 'acknowledged');
  return <div className="view-actions">{actions.map(action => action.kind === 'input' ? <form key={action.id} onSubmit={event => { event.preventDefault(); const input = new FormData(event.currentTarget).get('value'); if (typeof input === 'string' && input.trim()) void submit(action, input.trim()); }}><label className="sr-only" htmlFor={`action-${action.id}`}>{action.label}</label><input id={`action-${action.id}`} name="value" placeholder={action.placeholder ?? action.label} maxLength={2000} disabled={!enabled || Boolean(pending)} autoComplete="off" /><button disabled={!enabled || Boolean(pending)} type="submit">{action.label}<Icon name="arrow" size={17} /></button></form> : action.kind === 'choice' ? <fieldset key={action.id} disabled={!enabled || Boolean(pending)}><legend>{action.label}</legend><div>{action.options?.map(option => <button key={option} onClick={() => void submit(action, option)}>{option}</button>)}</div></fieldset> : <button key={action.id} disabled={!enabled || Boolean(pending)} onClick={() => void submit(action, true)}>{pending === action.id ? <span className="spinner" /> : sent?.actionId === action.id ? <Icon name="check" size={16} /> : null}{action.label}</button>)}
    {sent && <span className="action-status" role="status">{acknowledged ? 'Acknowledged' : 'Sent · awaiting acknowledgement'}</span>}{error && <span className="inline-error" role="alert">{error}</span>}{!enabled && <span className="action-status">View-only access</span>}
  </div>;
}
