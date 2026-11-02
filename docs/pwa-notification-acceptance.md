# Windows installed-PWA notification acceptance

Report e42f1e7f-0287-44c6-8be8-5e566033ca52 remains **device validation required**.
The observed Windows root cause is not established. Provider acceptance, mocked
WindowClients, synthetic Chromium worker events and headless LaunchQueue tests do not prove native OS launch.

## Change and automated scope
The click handler now invokes openWindow in the notification click task, before
any asynchronous enumeration or diagnostic storage. It verifies/navigates the
returned client before focusing. A rejected/null launch may recover an existing
same-origin ordinary app window; OAuth/consent/external windows are excluded.
Failures are contained and recorded, not treated as success. Unit tests execute the worker script with simulated clients and cover failure paths. Browser tests exercise the existing launch consumer and exact destination rendering with simulated launch metadata. Neither supplies an OS toast or an installed-app user gesture. No change to the
manifest identity, push destination validation, permissions or launchQueue rules.

## Automation limitation observed on DEV
An extra real-worker notification experiment was not included in the executable
suite: this headless Chromium environment reports Notification.permission=denied
inside the activated worker even after both context-wide and explicit-origin
Playwright permission grants. A direct showNotification probe rejects with
TypeError: no notification permission has been granted for this origin. Local
push diagnostics did record push-received / notification-failed. The experiment
never reached notification click; it is not evidence of a Windows cause or fix.
No application permission checks were weakened to make the experiment pass.

## Device procedure (Windows + Chrome installed app)
1. Open updated DEV app once, confirm the new /sw.js is active in Application →
   Service Workers. Close/reopen if an older worker is still controlling it.
   Keep the installed app identity; do not reinstall as an unrecorded workaround.
2. Record Windows and Chrome versions, notification permissions and whether
   Chrome is allowed to run background apps after all windows close. Note Focus
   Assist / Do Not Disturb and whether the browser is still running.
3. Sign in, enable notifications for this device, create two displays with visibly
   different content. Send a content-free notification to the **non-default**
   display. Record send time separately from provider acceptance and OS appearance.
4. Repeat with (a) app at root, (b) app in another display, (c) all installed-app
   windows closed but Chrome running, (d) Chrome/app fully closed. Click the actual
   Windows toast; separately try its Action Center entry if present.
5. Pass requires an actual visible window on the exact requested display, correct
   content, and no unintended duplicate window. Record launch and paint times.
   If signed out, account access must still be required; no ACL bypass is expected.
6. Reopen the app manually after a failure and inspect local worker evidence below.
   No new click record means no observed click reached this worker; it does not
   establish whether Windows, Chrome, an outdated worker or notification delivery
   was responsible. A focused record is client-API success, not proof of painting.

## Local content-free worker evidence
In DevTools console for the same origin:
~~~js
const c = await caches.open('kanvas-push-diagnostics-v1');
for (const kind of ['push','click']) {
  const r = await c.match('/__kanvas_push_diagnostics__/' + kind);
  console.log(kind, r ? await r.json() : 'no recorded event');
}
~~~
Only the latest push and click are retained, with schema version, timestamps,
stage names and an allowlisted exception name. No destination URL, account ID,
message text, payload, exception message or credentials are stored or uploaded.
This intentionally records cold clicks even when no window can be opened.
Cache storage may be unavailable; missing evidence is not proof of no OS click.
Overlapping same-kind events are best-effort last-writer evidence, not an audit log.
Clear diagnostic records with:
~~~js
await caches.delete('kanvas-push-diagnostics-v1');
~~~
Useful stages: push-received / notification-shown, click-received / open-requested,
open-failed / open-no-client, fallback-client / no-window-client,
navigated / navigate-no-client, focused / activation-failed.

## Rollback
Independent code/test/docs change; no migration, server endpoint, credentials,
version bump or feature flag. Revert code, then let service-worker update activate.
The bounded diagnostic cache can be deleted independently; it is never served as
application content and does not contain account pages.
