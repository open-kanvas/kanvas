import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index:'src/server/index.ts', 'backup-postgres':'scripts/backup-postgres.ts', 'migrate-sqlite':'scripts/migrate-sqlite.ts', 'create-user':'scripts/create-user.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist/server',
  external: ['node:sqlite'],
  // SQLite is used only by the offline legacy importer, never application storage.
  removeNodeProtocol: false,
  clean: true,
});
