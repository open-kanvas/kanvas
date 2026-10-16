import { createShutdown } from './shutdown.js';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { mcpProfile } from './mcp/operations.js';
import { resendSigninMailer } from './email-signin.js';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KANVAS_VERSION } from '../shared/version.js';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const host = process.env.HOST ?? '127.0.0.1';
const publicUrl = process.env.KANVAS_PUBLIC_URL ?? `http://127.0.0.1:${port}`;
const mailCredential = process.env.CREDENTIALS_DIRECTORY ? join(process.env.CREDENTIALS_DIRECTORY, 'kanvas-mailer') : undefined;
if (process.env.KANVAS_EMAIL_SIGNIN === 'true' && (!process.env.KANVAS_MAIL_FROM || !mailCredential || !existsSync(mailCredential))) throw new Error('Email sign-in requires KANVAS_MAIL_FROM and the kanvas-mailer service credential.');
// A deployed bundle serves its sibling client release. Rebuilding the working
// tree must never swap a live service's UI independently of its backend.
const packagedClient = fileURLToPath(new URL('../client/', import.meta.url));
const pushCredential=process.env.CREDENTIALS_DIRECTORY?join(process.env.CREDENTIALS_DIRECTORY,'kanvas-push'):undefined;
function configuredPush():import('./push.js').PushOptions|undefined{
 if(process.env.KANVAS_PUSH_ENABLED!=='true')return;
 try{const value=JSON.parse(readFileSync(pushCredential??'', 'utf8'));
  if(typeof value.publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(value.publicKey)||typeof value.privateKey!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.privateKey)||typeof value.subject!=='string'||!/^mailto:[^\s@]+@[^\s@]+$/.test(value.subject)||value.subject.length>254)throw new Error();
  return {publicKey:value.publicKey,privateKey:value.privateKey,subject:value.subject};
 }catch{throw new Error('Push requires a valid protected kanvas-push service credential.');}
}
const pushOptions=configuredPush();
let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
let server: Server | undefined;
const shutdown = createShutdown({
  stopAccepting: () => { server?.close(); },
  cleanup: async () => { await runtime?.close(); server?.closeAllConnections(); },
});
process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());
try {
runtime = await createApp({
  onOwnershipLost: () => shutdown(1),
  pushOptions,
  serviceAdmins:(process.env.KANVAS_SERVICE_ADMINS??'').split(',').map(x=>x.trim()).filter(Boolean),
  pairingFailedLimit:Number(process.env.KANVAS_PAIRING_FAILED_LIMIT??50),
  mcpProfile: mcpProfile(process.env.KANVAS_MCP_PROFILE),
  publishSetupEnabled: process.env.KANVAS_PUBLISH_SETUP !== 'false',
  ...(process.env.KANVAS_EMAIL_SIGNIN === 'true' ? { signinMailer: resendSigninMailer(mailCredential!, process.env.KANVAS_MAIL_FROM!) } : {}),
  consoleUrl:process.env.KANVAS_CONSOLE_URL??process.env.KANVAS_ADMIN_URL,
  docsUrl:process.env.KANVAS_DOCS_URL,
  publicUrl,
  ...(existsSync(fileURLToPath(new URL('../client/index.html', import.meta.url))) ? { staticDirectory: packagedClient } : {}),
  allowRegistration: process.env.KANVAS_ALLOW_REGISTRATION !== 'false',
  ...(process.env.KANVAS_LOG_OAUTH_DIAGNOSTICS === 'true' ? {
    onOAuthDiagnostic: (event: import('./app.js').OAuthDiagnostic) => console.info(JSON.stringify(event)),
  } : {}),
  ...(process.env.KANVAS_DEV_CLIENT === 'true' ? { allowedOrigins: ['http://127.0.0.1:5173'] } : {}),

});
server = runtime.app.listen(port, host, () => { console.info(`KANVAS ${KANVAS_VERSION} listening on ${host}:${port} (${mcpProfile(process.env.KANVAS_MCP_PROFILE)} MCP profile).`); });
server.requestTimeout = 30_000; server.headersTimeout = 15_000;
server.on('error', () => { console.error('KANVAS could not bind its configured listener.'); shutdown(1); });
} catch {
  console.error('KANVAS startup failed; exiting for supervised retry.');
  shutdown(1);
}
