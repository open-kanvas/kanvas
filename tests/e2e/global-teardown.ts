import { testDatabase, removeTestDatabase } from '../postgres.js';
export default async function teardown() {
  if (!process.env.KANVAS_E2E_RUN_ID) throw new Error('Missing disposable E2E database identity.');
  await removeTestDatabase(testDatabase(process.env.KANVAS_E2E_RUN_ID));
}
