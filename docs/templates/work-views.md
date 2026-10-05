# Communication and technical views

These source-driven templates extend KANVAS without connecting it to email, chat, cloud or repository providers. The agent supplies authorized source data; publishing is not an external action.

| Template | Source and interaction |
| --- | --- |
| `email` | `messages`: from/to/cc/subject/timestamp/body; exact text and thread boundaries |
| `inbox` | `items`: sender, subject, snippet, timestamp and unread; read-only rows with paging or scrolling, no embedded full-message actions |
| `chat` | `messages`: stable id, sender, source timestamp and exact text; optional `contextLabel`, `conversationLabel` and `participants`; `kanvas_call` with `operationId:"kanvas.chat.append"` and nested `arguments` accumulates new messages |
| `cards` | Generic records with id/title, free status, labels, assignees and custom scalar fields |
| `bookmarks` | External URL collection with optional categories/favicon; Web view drilldown and viewer-activated new-tab link |
| `tool-inventory` | Persistent left integration rail and independently scrollable selected tools; `activeGroup` supplies the initial selection; agent paging changes groups |
| `tool-detail` | Name, description, parameters (name/type/required/description) and returns; no invented approval or host permission metadata |
| `code-workspace` | File tree, activePath and an exact code or diff excerpt; stacked on phones |
| `developer` | `kind`: pull-request, pipeline, commits or review; issues can use generic cards |
| `operations` | `kind`: environments, alerts, access, cost or rollout; free-form supplied status/fields/stages |

Get each exact contract and a ready example through `kanvas_call` with `operationId:"kanvas.template.get"` and nested `arguments`. The [public schema index](https://kanvas.creatrix.no/docs/index.json) is generated from the same runtime definitions.

## Agent-authored selection

`kanvas_call` with `operationId:"kanvas.selection.set"` and nested `arguments` requires sessionId, displayId, requestId, expectedRevision and selection. The view stores the original complete source and a separate selection instruction. Setting selection to null restores all records in their original order.

```json
{
  "where": [{"field":"status","op":"eq","value":"open"}],
  "sort": [{"field":"fields.cost","type":"number","direction":"desc"}],
  "highlight": [{"field":"priority","op":"eq","value":"high"}]
}
```

No filtering inputs, dropdowns or sorting buttons are added. Literal keys and dotted field paths are supported; the empty key addresses a scalar list item. Decimal-string comparison avoids floating-point loss. Invalid or missing numeric fields sort last. Currency and date strings are not silently parsed. Raw log line IDs remain tied to the original line numbers.

Collection targets and examples are in [public selection Help](https://kanvas.creatrix.no/docs/selection).

Email, inbox and chat are read-oriented surfaces: they accept no generic reply/input actions. To compose text, publish a separate drafting view; the authorized agent handles actual delivery in the original system. Parameter type cells in tool detail stay on one line.

## Incremental chat

`kanvas_call` with `operationId:"kanvas.chat.append"` and nested `arguments` accepts up to 100 supplied messages per call, up to 1,000 in a thread, each with a stable unique ID. The original sender, text and timestamp remain exact. Same requestId plus identical input retries once; competing revisions and repeated message IDs are rejected. A viewer who has scrolled back is not pulled to the latest message. There is no send-to-Slack/email/WhatsApp action.

## Bookmarks and tabs

Bookmarks are external URLs, not KANVAS content pins. Opening one preserves the current source and does not rewrite session content. Each card has **Preview in KANVAS** and a separate **Open in new tab** link. Card columns and widths adapt to supplied content and available space; long items keep their own links inside their cards. The link is viewer-activated. Browsers block arbitrary agent-triggered popups without a user gesture; this release does not promise an agent can force a new tab. The agent can publish the bookmark and direct attention to the link.

## Image recovery

When an image cannot load directly, KANVAS can fetch the exact current source URL anonymously through a bounded public-network request. Successful raster bytes are delivered through an authorization- and revision-bound endpoint. Public SVGs use a static raster preview created in isolated Chromium with scripts and network subrequests blocked. Original URLs/content remain stored. Host diagnostics distinguish observed DNS failures, HTTP refusal, timeout, invalid image content and private-network rejection; they do not infer a hotlink/CORS cause from a browser error alone.

There is no private-cookie forwarding, login bypass, or fabricated substitute for an unavailable source.
