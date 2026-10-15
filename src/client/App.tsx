import { SessionEntry } from './PublicSession';
import { DeviceReceiver, LiveEntry } from './DeviceReceiver';
import { Suspense, lazy, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './hooks';
import { AuthScreen, ConsentScreen, DeviceConnectScreen, type ViewerRoute } from './Auth';
import { Wordmark } from './icons';
import { viewerPath } from './api';
import { ShareScreen, parseShareRoute } from './Share';
import { EmailConfirmation, takeEmailFragment } from './EmailSignin';
import { Overview } from './Overview';
import { Welcome } from './Welcome';
const initialEmailToken = typeof window === 'undefined' ? undefined : takeEmailFragment();
const Viewer = lazy(() => import('./Viewer').then(module => ({ default: module.Viewer })));
const Workspace = lazy(() => import('./Workspace').then(module => ({ default: module.Workspace })));

export function parseViewerRoute(pathname: string): ViewerRoute | undefined {
  const match = /^\/view\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return;
  try { return { sessionId: decodeURIComponent(match[1]), displayId: decodeURIComponent(match[2]) }; } catch { return; }
}
function Router({ emailToken }: { emailToken?: string }) {
  const auth = useAuth();
  if(emailToken)return <EmailConfirmation token={emailToken}/>;
  const viewer = parseViewerRoute(window.location.pathname), authorize = new URLSearchParams(window.location.search).get('authorize');
  if (auth.loading) return <main className="app-loading"><Wordmark /><span className="spinner" /><span>Opening your space…</span></main>;
  if (!auth.user && auth.error) return <main className="app-loading"><Wordmark /><h1>Couldn’t open your workspace.</h1><p role="alert">{auth.error}</p><button className="button button-primary" onClick={() => void auth.refresh().catch(() => {})}>Try connecting again</button></main>;
  // OAuth intent takes precedence over all display/home entry routes. A paired
  // screen represents its owner for viewing only, never account consent.
  if (window.location.pathname === '/connect') return <DeviceConnectScreen/>;
  if (authorize !== null) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(authorize)) return <main className="consent-layout"><Wordmark/><h1>This connection request is invalid.</h1><p>Return to your agent and choose Connect again.</p><a href="/">Return to KANVAS</a></main>;
    if (!auth.user || auth.viewOnly || auth.captureOnly) return <AuthScreen authorizationRequestId={authorize}/>;
    return <ConsentScreen key={authorize} requestId={authorize}/>;
  }
  const shareId = parseShareRoute(window.location.pathname);
  if (shareId) return <ShareScreen key={shareId} shareId={shareId} />;
  const invitation = /^\/welcome\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
  if (invitation) return <Welcome key={invitation[1]} invitationId={invitation[1]} />;
  const sessionEntry=/^\/session\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
  if(sessionEntry)return <SessionEntry sessionId={sessionEntry[1]}/>;
  if(viewer&&!auth.viewOnly)return <SessionEntry {...viewer}/>;
  if (!auth.user) return <AuthScreen viewer={viewer} />;
  if (auth.viewOnly && auth.sessionId && auth.displayId && (!viewer || viewer.sessionId !== auth.sessionId || viewer.displayId !== auth.displayId)) {
    window.location.replace(viewerPath(auth.sessionId, auth.displayId)); return <main className="app-loading"><span className="spinner" />Opening the approved display…</main>;
  }
  if (viewer) return <Viewer key={`${viewer.sessionId}:${viewer.displayId}`} {...viewer} />;

  // The root URL is the account home (sessions, new session, account). Screens
  // and installed apps use the live start page, /start.
  if(window.location.pathname==='/console')return <Workspace/>;
  if(window.location.pathname==='/')return <Overview/>;
  if(window.location.pathname==='/start')return <LiveEntry/>;
  if (window.location.pathname !== '/') return <main className="app-loading"><Wordmark /><h1>This page is not here.</h1><a href="/">Return to your workspace</a></main>;
  return <Workspace />;
}
export default function App() {
  const [emailToken,setEmailToken]=useState(initialEmailToken);
  useEffect(()=>{const changed=()=>{const token=takeEmailFragment();if(token)setEmailToken(token);};window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
  return <AuthProvider><Suspense fallback={<main className="app-loading"><Wordmark /><span className="spinner" /></main>}><DeviceReceiver suspended={Boolean(emailToken)}><Router emailToken={emailToken}/></DeviceReceiver></Suspense></AuthProvider>; }
