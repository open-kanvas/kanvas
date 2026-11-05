# Device privacy and display kiosk lockdown

`device.lock` / `device.unlock` take an owned `deviceId` from `devices.read` and require account-wide publish authority. No PIN or extra consent step is added. A privacy lock hides **all Kanvas routes, sessions, history and windows in that browser installation**. The server withholds browser API/media data and closes active streams; the client unmounts cached app content within its one-second status poll. Content published while locked is stored normally and appears after unlock. Nothing is deleted.

A persistent HttpOnly host-only cookie plus registered browser-session binding identifies the installation. Reload and browser restart retain the server lock. Another browser/profile/private window is a separate device and must independently sign in. Clearing site data or possessing the owner's account/authorized connector is outside this shoulder-surfing protection. Previously downloaded files and browser memory cannot be retroactively erased. This is not an OS screen lock.

Offline: the app hides content when it detects offline/status failure (bounded four-second request timeout). A disconnected process cannot receive a remote command immediately. Suspended/frozen browsers may not repaint until resumed. Normal content returns only after a successful unlocked server response. This trades offline viewing for privacy. All windows check independently; no session name/title is shown on the lock screen.

Recovery: sign in on another device, open Console → Account → Signed-in browsers → Privacy-locked devices, and unlock the named device. An owner may also reconnect the AI connector from another device and call `device.unlock`. No anonymous recovery endpoint exists.

`display.lockdown` takes `sessionId`, `displayId`, `locked`. It is a **different owner-only setting**: content stays visible and intrinsic form/poll/satisfaction responses remain available. Menus, history/swipe navigation, pointing and annotations are not mounted. Owner tools may update content and clear lockdown. `/kiosk/<sessionId>/<displayId>` starts the same restricted renderer immediately for any authorized display; satisfaction uses this general route too. The regular viewer automatically follows the server setting.

App kiosk restrictions cannot disable the browser's address bar, tabs, developer tools, system shortcuts, external applications or a determined technical user. Use browser/OS kiosk policies for unattended public hardware. They grant no additional access. Device privacy lock also covers a kiosk display.
