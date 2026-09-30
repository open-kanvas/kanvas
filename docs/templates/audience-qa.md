# Audience Q&A and word clouds

Accepted in the 2026-09-09 feedback scope; renderer ID `qa`.

## Content contract

`prompt` is required (1–2,000 characters). `mode` is `questions` (default) or `word-cloud`. `maxLength` defaults to 500 and is at most 2,000; `closed` defaults to `false`, and `revealResults` defaults to `true`.

```json
{"version":1,"template":"qa","data":{"prompt":"What should we discuss?","mode":"questions","maxLength":500,"revealResults":true}}
```

## Responses and presentation

An authorized participant submits `{"kind":"qa.submit","text":"How was this measured?"}`. The server validates access, revision, length and closed state, then records the response. Whitespace-only submissions fail. Submitted text is not HTML or executable content.

Question mode displays a bounded recent list from persisted server responses. Word-cloud mode displays server-computed, case-normalized word frequencies; font size expresses relative frequency and an accessible count reports **occurrences**, not a claimed number of distinct people. Repeated words in one response can add multiple occurrences. The client does not accept fabricated aggregate entries in the submitted view.

With `revealResults: false`, neither question text nor word-cloud entries are sent in the participant display projection. The presenter can reveal them by editing the current view. `closed` stops new submissions. These controls do not imply implemented moderation, question answering, identity verification or unlimited archiving.

Interactive guest entry and approval are separate access features; this template never turns a share address into a private-session credential.

See the [template index](README.md), [live polls](live-polls.md) and [authoritative schemas](../../src/shared/view-schemas.ts).
