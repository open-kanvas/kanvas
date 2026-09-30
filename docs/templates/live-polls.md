# Live polls

Accepted in the 2026-09-09 feedback scope; renderer ID `poll`.

## Content contract

Required fields are `question` (1–2,000 characters) and 2–12 unique-ID `{id,label}` options. `maxChoices` defaults to 1 and cannot exceed the number of options. `closed` and `revealResults` both default to `false`.

```json
{"version":1,"template":"poll","data":{"question":"Where should we focus?","options":[{"id":"clarity","label":"Clarity"},{"id":"depth","label":"Depth"}],"maxChoices":1,"revealResults":false}}
```

## Voting and controlled reveal

Participants submit `{"kind":"poll.vote","optionIds":["clarity"]}`. The server validates current revision, access, allowed unique option IDs and the maximum choice count. One current vote is stored per authorized participant identity; updating a vote replaces that identity’s previous choice rather than incrementing the audience size. A guest/device identity is not proof of one unique human.

The server computes counts and participant totals from persisted responses. Neither poll data nor participant responses accept caller-authored totals. Before reveal, the API projection omits counts and total-vote fields entirely; the renderer also refuses to show hidden values if presented with an inconsistent projection. A participant may see their own selected option IDs.

The presenter reveals or hides results by editing `revealResults` on the current view. Changing only reveal/closed controls preserves votes. Closing prevents further voting. Publishing a newly defined poll starts a new response context.

For multi-choice polls, option counts may sum above the participant total. The display labels that condition rather than presenting summed selections as unique people. A renderer without a server projection never fabricates a zero-vote result.

See the [template index](README.md), [forms](forms.md) and [authoritative schemas](../../src/shared/view-schemas.ts).
