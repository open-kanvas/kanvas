# On-screen join invitation

Runtime template ID: `join`.

A large QR image, readable short address, expiry and explicit approval notice for another screen. Expired invitations stop displaying a usable code. A QR is a locator, never an access grant.

## Preferred workflow

Use `kanvas_call` with `operationId:"kanvas.share.create"` and nested `arguments` with `showOnDisplay: true`, `requestId` and the display's current `expectedRevision`. The tool returns the invitation and QR asset as before, and submits this template using the same invitation. QR creation, asset storage and publication are atomic; identical request retries do not create more invitations. By default `showOnDisplay` is false and existing content stays in place. Held displays remain held.

The intended browser still requests pairing. An authorized owner must separately approve it; displaying or scanning the code does not bypass consent. Protected QR media follows session access controls.

## Prepared-view contract

`url` is a supplied public URL or exact same-origin `/s/:alias`, `qr` has `url` and `alt`, `expiresAt` is an ISO timestamp, with optional `label` and `description`. Use the actual values returned by the share tool, not an invented code or invitation. `kanvas_discover` with `catalog:"templates", action:"get", id:"kanvas.template.join"` and `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` expose the exact schema.

[Agent workflows](../integration/agent-workflows.md#agent-workflows) · [Template index](README.md).
