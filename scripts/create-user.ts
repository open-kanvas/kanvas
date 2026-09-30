/** Local administrator account creation. Passwords are accepted only by a masked TTY prompt. */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Auth } from '../src/server/auth.js';
import { AppError, Store } from '../src/server/store.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.info('Usage: node dist/server/create-user.js');
    console.info('Uses KANVAS_PG_* configuration. Run in an interactive server terminal. Password input is hidden; public registration stays unchanged.');
    return;
  }
  if (args.length) throw new AppError('INVALID_ARGUMENTS', 'Configure PostgreSQL through KANVAS_PG_* settings. Passwords must never be supplied as arguments.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new AppError('TTY_REQUIRED', 'Use an interactive server terminal; piped passwords are not accepted.');
  if (process.env.DEBUG || process.env.NODE_DEBUG || process.env.NODE_DEBUG_NATIVE) throw new AppError('DEBUG_DISABLED', 'Disable debug logging before creating an account.');

  let muted = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  terminal.on('SIGINT', cancel); process.once('SIGTERM', cancel);
  let store: Store | undefined;
  let password = '', confirmation = '';
  const ask = (question: string) => terminal.question(question, { signal: abort.signal });
  const hidden = async (label: string) => {
    process.stdout.write(label); muted = true;
    try { return await ask(''); }
    finally { muted = false; process.stdout.write('\n'); }
  };
  try {
    const username = (await ask('Username: ')).trim();
    const displayName = (await ask('Display name: ')).trim();
    password = await hidden('Password (10–256 characters; hidden): ');
    confirmation = await hidden('Confirm password (hidden): ');
    if (password !== confirmation) throw new AppError('PASSWORD_MISMATCH', 'Passwords did not match. No account was created.');
    store = new Store();
    await store.ready;
    const account = await new Auth(store, true, true).register({ username, displayName, password });
    console.info(`Account ${account.username} created. Public registration was not enabled.`);
  } finally {
    password = ''; confirmation = '';
    process.off('SIGTERM', cancel); terminal.close(); (await store?.close());
  }
}

main().catch(error => {
  console.error(error instanceof AppError ? error.message : error instanceof Error && error.name === 'AbortError' ? 'Account creation cancelled.' : 'Account creation failed. No existing account was replaced.');
  process.exitCode = 1;
});
