# Independent displays per session

A session holds content and permissions; a display is an independently addressable virtual surface. A physical device/browser window may receive a selected display. These identities are distinct.

Register and inspect displays through the operations catalog. Publish with explicit displayIds when targeting several displays; omission selects the session's stable primary display, not a broadcast. Per-display revisions, history, holds and delivery acknowledgements remain independent. Use device.present/window.present to direct authorized receiving browsers; a URL is only a locator, never permission.

Session synchronization can be independent, shared or presenter-following. Read current configuration and viewer state before changing it. Use session-topology to visualize actual receiving windows; an old device registration is not evidence it is online. Exact limits and schemas are available in the running `/docs/` reference.
