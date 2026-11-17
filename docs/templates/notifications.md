# Notification summaries versus device push

The implemented `notifications` template displays agent-supplied alert items on a Kanvas view. Kanvas does not fetch the underlying inbox/calendar/flight feeds. Preserve source, timing and relevant urgency without inventing unseen alerts.

This is distinct from an in-view toast (`kanvas.toast`) and from browser/PWA push. Push is explicitly enabled in the corner menu and can target named browser subscriptions with `kanvas.notifications.send`. The live help topic `kanvas.help.notifications` describes notification controls. A toast is not OS push; a provider receipt is not evidence that a person read it.
