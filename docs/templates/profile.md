# Profile and contact details

Runtime template ID: `profile`. One person/organization profile combines identity, optional portrait and biography with explicitly typed contact methods; there is no separate contact-card template.

All identity/contact content and media must be supplied. There is no address-book integration, person lookup, geocoding, automatic contact action or inferred contact information.

## Backward-compatible details

The existing `details` array accepts up to 20 strict `{label, value, type?}` entries. Labels remain at most 240 characters and original values at most 4,000 characters. The optional `type` is one of:

- `text`, or omitted: ordinary label/value text. An email- or phone-looking value remains **plain**, even if its label says “Email” or “Phone”. Existing entries are not rewritten and no default `type` is added to their stored data.
- `phone`: a deliberate `tel:` anchor. Supply 3–15 digits, optional leading `+`, and ordinary spaces, periods, hyphens or parentheses. An explicit `x`, `ext` or `extension` suffix can supply up to 10 extension digits. The target removes formatting only; it never invents a country code. URI prefixes, queries, percent escapes, pauses, USSD/dial commands and arbitrary URI parameters are rejected.
- `email`: a deliberate `mailto:` anchor for one simple mailbox address. Plus aliases and the exact recipient are retained by safe percent encoding. Supply an address, not a `mailto:` URI, display-name wrapper, recipient list, query, header or pre-filled message. Control characters and percent escapes are rejected. No message is sent by KANVAS.
- `link`: a safe public **HTTPS** URL. Its supplied query and fragment remain part of the destination. Arbitrary URI schemes and private/local destinations are rejected.
- `address`: readable source address text, including line breaks. A separate **Open in Maps** anchor encodes the entire address as one query to a public HTTPS map search. No map is requested until the user chooses that link. Very long addresses remain readable without a maps action if the encoded URL would exceed safe URL limits.

Typed contact methods and their original labels stay prominent and tappable, including with generic title/source/control chrome hidden and inside presentations. Phone/email links use the receiving device's configured handler; KANVAS does not claim that a call connected or an email was delivered. Outbound website/maps links open isolated tabs. Original display text, phone formatting and email aliases are preserved.

Biography and plain details remain available below the contact methods. Long names, values and descriptions wrap in a bounded scroll region, rather than overflowing the page or being truncated. Live contact targets are at least 44px high and have visible keyboard focus.

The separate `links` array remains unchanged: up to 12 `{label, url}` entries under its existing safe public HTTP(S)/authorized asset-link policy. Optional profile images keep the normal source authorization and actual media-readiness requirements.

Read `kanvas_inspect` (`operation: "template.get"`) for `profile` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing. Invalid typed values are rejected at their `details[index].value` field; marking a value `text` or leaving it untyped never creates an action.

## Illustrative example

```json
{
  "version": 1,
  "template": "profile",
  "data": {
    "name": "Alex Morgan",
    "kind": "person",
    "role": "Designer",
    "description": "Making complex ideas feel simple.",
    "details": [
      { "label": "Phone", "value": "+1 (202) 555-0142", "type": "phone" },
      { "label": "Email", "value": "alex+design@example.com", "type": "email" },
      { "label": "Website", "value": "https://example.com/alex", "type": "link" },
      { "label": "Studio", "value": "123 Example Street, Example City", "type": "address" },
      { "label": "Based in", "value": "Oslo" }
    ],
    "links": [
      { "label": "Portfolio", "url": "https://example.com/portfolio" }
    ]
  }
}
```

These contacts are illustrative, not evidence or real supplied contact information. See [contact target validation](../../src/shared/profile-contact.ts), [implemented rendering](../display/implemented-rendering.md) and the [template index](README.md).
