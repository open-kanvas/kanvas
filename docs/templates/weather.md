# Atmospheric weather

Runtime template ID: `weather`.

A full-surface procedural WebGL scene with a Canvas fallback driven solely by supplied conditions and time of day: atmospheric sky gradients, fractal shaded cloud banks, parallax, rain/snow and fog. The landscape is illustrative, not a photograph or claim about the supplied place. No external imagery or weather API is fetched. Animation is capped at 24 fps (not a guaranteed frame rate). WebGL ray-marches bounded cloud volumes, adapting resolution on slow/software renderers up to 1100 pixels wide; the Canvas fallback is capped at 1600 pixels wide. Preview thumbnails stay static and do not allocate WebGL contexts. Animation pauses when hidden and becomes static for reduced-motion preferences. Storms deliberately avoid flashing lightning.

## Contract and boundaries

Supports clear, partly-cloudy, cloudy, rain, snow, storm and fog; day, night, sunrise and sunset. Temperature, high/low and place are optional; optional `timeLabel` identifies the forecast period. Visual-only weather is valid without a temperature. These are exact source strings, including units. An old combined string such as `19C / 12C` remains unchanged; the renderer does not guess that the pair means high/low. Optional `display` booleans select place/time/temperature/description/details/timeline; `visualOnly:true` suppresses all text and timeline while preserving supplied data. Defaults retain existing visibility. Up to 24 hourly or multi-day forecast records form an explicit time strip. Scenes advance every eight seconds when motion is enabled; pause or select a time directly. Optional period and intensity on each forecast record control its day/night and precipitation scene. Temperature, high/low and eight detail pairs remain source supplied; current-period details are not falsely applied to a later forecast moment.

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

## Forecast sequence

The top-level conditions are always the first step, labelled with `timeLabel` (or the overview fallback). N forecast entries produce N+1 steps: for exactly four moments, supply the first at the top level and three in `forecast`. Do not repeat the first moment; it cannot be omitted. Storm clouds remain darker than ordinary cloudy skies, with a subtle additional darkening as intensity rises from 0 to 1.
