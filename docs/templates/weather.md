# Atmospheric weather

Runtime template ID: `weather`.

A full-surface, self-contained SVG illustration and restrained CSS atmosphere driven by supplied conditions and time of day. The September 13 redesign uses recognizable clouds, sun/moon, rain, snow, lightning and fog with dominant temperatures. Reduced-motion preferences disable the rain/snow/mist animation.

## Contract and boundaries

Supports clear, partly-cloudy, cloudy, rain, snow, storm and fog; day, night, sunrise and sunset. Supply `temperature`, or explicit `high` / `low`, or both; optional `timeLabel` identifies the forecast period. At least one temperature field is required. These are exact source strings, including units. An old combined string such as `19C / 12C` remains unchanged; the renderer does not guess that the pair means high/low. Place/condition stay visible. Up to 24 forecast records and eight detail pairs remain available under **Forecast & details**, not discarded or shrunk into tiny text.

The publisher should check the intended browser's fresh, consented location/timezone through `kanvas_call` with `operationId:"kanvas.viewers.read"` and nested `arguments` for local-weather requests; `kanvas_discover` with `{ "catalog":"help", "action":"search", "query": "viewer context permissions" }` followed by `action:"get"` on a result ID explains permission and ambiguity handling. The viewer does not call weather APIs or infer a location. The publisher owns weather data/provenance. Visual inspiration does not copy YR artwork or data.

Read `kanvas_discover` with `{ "catalog":"templates", "action":"get", "id":"kanvas.template.weather" }` before constructing a prepared view. It returns the exact same schema used by `kanvas_call` with `operationId:"kanvas.view.validate"` and nested `arguments` and publishing. See the [current discovery interface](../README.md).

## Illustrative example

```json
{
  "version": 1,
  "template": "weather",
  "data": {
    "place": "Oslo",
    "high": "19°C",
    "low": "12°C",
    "timeLabel": "Tomorrow — illustrative example",
    "condition": "clear",
    "period": "sunset",
    "description": "Illustrative conditions",
    "forecast": [
      {
        "time": "19:00",
        "temperature": "17°",
        "condition": "clear"
      },
      {
        "time": "20:00",
        "temperature": "15°",
        "condition": "cloudy"
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
