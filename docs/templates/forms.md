# Surveys and forms

Accepted in the 2026-09-09 feedback scope; renderer ID `form`.

## Content contract

A form has 1–40 unique-ID `fields`, optional `description` (up to 4,000 characters), `submitLabel` (default “Submit response”), and `closed` (default `false`). Every field has `id`, `type`, `label`, optional `help`, and `required` (default `false`). Reserved object-key names cannot be field or option IDs.

| Field type | Additional fields | Submitted value |
| --- | --- | --- |
| `text`, `textarea`, `email` | `placeholder?`, `maxLength` (default 2,000; max 10,000) | Exact string |
| `number` | `min?`, `max?`, positive `step?`, `placeholder?` | Finite JSON number |
| `range` | Required `min`, `max`; positive `step` (default 1) | Finite JSON number; initially the minimum |
| `choice` | 2–20 unique-ID `{id,label}` options | Selected option ID |
| `multi-choice` | 2–20 options; optional `maxChoices` | Unique selected option IDs |
| `checkbox` | No type-specific fields | Boolean; required means checked |
| `file` | `accept?`, `maxSize?` (up to 10 MiB), `maxCount?` (1–5, default 1) | Authorized uploaded asset references; see [file uploads](file-uploads.md) |

The inputs are real labelled browser fields with keyboard support, required/limit feedback and a single structured submission. Empty optional values are omitted. A successfully submitted form shows its persisted receipt after reload. Read-only participants see disabled fields, and closed forms do not accept responses.

## Responses

The renderer emits one intrinsic response:

```json
{"kind":"form.submit","values":{"topic":"Exact data","format":"workshop","rating":4,"ready":true}}
```

The server verifies the current display revision and participant access, then checks unknown fields, required values, numeric bounds/steps, text limits, email shape and option IDs against the displayed form. Browser checks are not the authority. The interaction inbox receives `actionId: "form.submit"` and the validated field-value object. A submitted email is form content, not verified mailbox ownership.

See the [template index](README.md) and [authoritative schemas](../../src/shared/view-schemas.ts).
