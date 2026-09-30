import { createApp } from './app.js';
import { mcpProfile } from './mcp/operations.js';
import { resendSigninMailer } from './email-signin.js';
import { join } from 'node:path';
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
const runtime = await createApp({
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
const server = runtime.app.listen(port, host, () => { console.info(`KANVAS ${KANVAS_VERSION} listening on ${host}:${port} (${mcpProfile(process.env.KANVAS_MCP_PROFILE)} MCP profile).`); });
server.requestTimeout = 30_000; server.headersTimeout = 15_000;
let stopping = false;
const shutdown = async () => {
  if (stopping) return; stopping = true;
  const force = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 10_000); force.unref();
  server.close(); await runtime.close(); server.closeAllConnections(); clearTimeout(force);
};
process.once('SIGINT', async () => { void (await shutdown()); }); process.once('SIGTERM', async () => { void (await shutdown()); });
server.on('error', async () => { console.error('KANVAS could not bind its configured listener.'); process.exitCode = 1; await shutdown(); });
