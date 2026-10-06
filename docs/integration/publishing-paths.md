# Publishing exact supplied content

Prefer a prepared view when the shape is known. Otherwise provide an explicit `templateHint` and exact schema-valid `data`, or a documented literal source. Plain text maps to a fact; a dataset without a hint maps to a table. Ambiguous objects and instructions without content return `PREPARED_VIEW_REQUIRED`.

`context` can carry literal source text. `intent` describes the desired action but never replaces missing source. A prepared view is validated directly, with the same source-access and delivery checks. No backend generation or translation occurs.

The following complete examples are exercised against the current publishing recipes. Replace locator IDs with actual returned targets. Execute these publication recipes with `kanvas_call`, `operationId:"kanvas.submit"` and the recipe fields nested inside `arguments`. Use `kanvas_discover` with `{catalog:"tools",action:"get",id:"kanvas.submit"}` for the full executable contract.

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "sessionId": "session-id",
      "displayIds": [
        "display-id"
      ],
      "requestId": "transcript-context-1",
      "context": "These are the exact supplied words.\nKeep this line too.",
      "intent": "Display these words verbatim as a completed transcript.",
      "templateHint": "transcription"
    }
  }
}
```

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "sessionId": "session-id",
      "displayIds": [
        "display-id"
      ],
      "requestId": "transcript-data-1",
      "context": "The following data is the supplied transcript.",
      "intent": "Show every supplied segment without rewriting.",
      "templateHint": "transcription",
      "data": {
        "segments": [
          {
            "id": "segment-1",
            "text": "Exact supplied words.",
            "speaker": "Speaker A",
            "timestamp": "00:01.020"
          }
        ],
        "status": "live"
      }
    }
  }
}
```

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "sessionId": "session-id",
      "displayIds": [
        "display-id"
      ],
      "requestId": "table-rows-1",
      "context": "These are the supplied ledger rows.",
      "intent": "Show every supplied row and its exact decimal text; do not aggregate, filter or round.",
      "templateHint": "table",
      "data": {
        "rows": [
          {
            "item": "A",
            "amount": "1.2300"
          },
          {
            "item": "B",
            "amount": "9007199254740993"
          }
        ]
      }
    }
  }
}
```

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "sessionId": "session-id",
      "displayIds": [
        "display-id"
      ],
      "requestId": "fact-context-1",
      "context": "The supplied count is 17.",
      "intent": "Show this supplied statement as one short fact.",
      "templateHint": "fact"
    }
  }
}
```

```json
{
  "name": "kanvas_call",
  "arguments": {
    "operationId": "kanvas.submit",
    "arguments": {
      "sessionId": "session-id",
      "displayIds": [
        "display-id"
      ],
      "requestId": "fact-data-1",
      "intent": "Show this exact supplied sentence.",
      "templateHint": "fact",
      "data": {
        "text": "Exact supplied sentence."
      }
    }
  }
}
```

## Errors and delivery

Malformed supplied transcript, table, time, geometry or media receives a safe field-specific error. Do not retry unchanged, invent absent values or replace source with a summary. Correct the source or send a prepared view that passes `kanvas_call with operationId:"kanvas.template.get" and arguments:{…}` / `validate`.

An update receipt is not proof of display. Check status and actual receiver acknowledgements. Failed validation preserves the previous display. Exact retries are idempotent.
