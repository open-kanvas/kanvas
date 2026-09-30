import type { ReportPage, ReportRecord } from '../../src/shared/reports';
import { createDisplay, createSession, expect, register, sessionApi, tab, test } from './support';

test('product reports can be reviewed and created in the responsive activity workspace', async ({ page }) => {
  await register(page);
  const sessionId = await createSession(page, 'Product reporting loop');
  const display = await createDisplay(page, sessionId, 'Related screen');
  const seeded = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/error-reports`, 'POST', {
    requestId: 'reported-publishing-failure', title: 'Publishing needs clearer errors', description: 'A hand-built fact did not match the template.',
    client: 'claude', displayId: display.id, steps: ['Register a display', 'Submit a fact'], expected: 'An actionable validation error', actual: 'Generic failure',
  });
  expect(seeded.status).toBe(200);
  await tab(page, 'Activity');
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const report = page.getByRole('article', { name: 'Report: Publishing needs clearer errors', exact: true });
  await expect(report).toBeVisible();
  await expect(report.getByRole('link', { name: 'Open related display' })).toHaveAttribute('href', `/view/${sessionId}/${display.id}`);
  await report.getByRole('button', { name: 'Review report', exact: true }).click();
  await report.getByLabel('Review status', { exact: true }).selectOption('resolved');
  await report.getByLabel('Review note', { exact: true }).fill('Verified the template-guided publish and clear validation response.');
  await report.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(report.getByText('Verified the template-guided publish and clear validation response.', { exact: true })).toBeVisible();
  await expect(report.getByRole('button', { name: 'Review report', exact: true })).toBeVisible();
  await page.getByLabel('Report status', { exact: true }).selectOption('open');
  await expect(report).toHaveCount(0);

  await page.getByRole('button', { name: 'Write a report', exact: true }).click();
  await page.getByLabel('Report type', { exact: true }).selectOption('feedback');
  await page.getByLabel('Report title', { exact: true }).fill('Keep viewer URLs easy to find');
  const text = '<script>window.reportExecuted = true</script> Show reports as text, not executable markup.';
  await page.getByLabel('What happened or could be better?', { exact: true }).fill(text);
  await page.getByLabel('Related display', { exact: true }).selectOption(display.id);
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Report saved.');
  const feedback = page.getByRole('article', { name: 'Report: Keep viewer URLs easy to find', exact: true });
  await expect(feedback).toBeVisible(); await expect(feedback).toContainText(text);
  expect(await page.evaluate(() => 'reportExecuted' in window)).toBe(false);
  const stored = await sessionApi<ReportPage>(page, `/api/sessions/${sessionId}/reports`);
  expect(stored.data?.reports).toHaveLength(2);
  expect(stored.data?.reports.some(item => item.status === 'resolved' && item.history.length === 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test('a live report review cannot silently overwrite a newer owner decision', async ({ page }) => {
  await register(page);
  const sessionId = await createSession(page, 'Concurrent report reviews');
  const seeded = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/feedback`, 'POST', { requestId: 'review-race', title: 'A shared review', description: 'Two browser tabs review the same report.' });
  expect(seeded.status).toBe(200);
  await tab(page, 'Activity'); await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const report = page.getByRole('article', { name: 'Report: A shared review', exact: true });
  await report.getByRole('button', { name: 'Review report', exact: true }).click();
  await report.getByLabel('Review note', { exact: true }).fill('Keep my unsaved investigation note.');
  const updated = await sessionApi<ReportRecord>(page, `/api/sessions/${sessionId}/reports/${seeded.data!.id}`, 'PATCH', { expectedRevision: 0, status: 'resolved', note: 'Verified in another tab.' });
  expect(updated.status).toBe(200);
  await page.getByRole('button', { name: 'Refresh reports', exact: true }).click();
  await expect(report.getByRole('alert')).toContainText('Another review changed this report.');
  await expect(report.getByLabel('Review note', { exact: true })).toHaveValue('Keep my unsaved investigation note.');
  await expect(report.getByRole('button', { name: 'Save review', exact: true })).toBeDisabled();
  const stored = await sessionApi<ReportPage>(page, `/api/sessions/${sessionId}/reports`);
  expect(stored.data?.reports[0]).toMatchObject({ revision: 1, status: 'resolved' });
});
