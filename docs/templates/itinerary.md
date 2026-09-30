# Trip itinerary

Runtime template ID: `itinerary`.

A glanceable, day-grouped plan with time, place, activity, description and outbound links.

## Contract and boundaries

Supply up to 31 days and 50 items per day. Times and places are source labels; there is no booking, routing, availability lookup or geocoding. Empty/omitted optional details are not invented.

Read `kanvas_inspect` (`operation: "template.get"`) for `itinerary` before constructing a prepared view. It returns the exact same schema used by `kanvas_inspect` (`operation: "view.validate"`) and publishing.

## Illustrative example

```json
{
  "version": 1,
  "template": "itinerary",
  "data": {
    "days": [
      {
        "date": "2026-09-12",
        "title": "A day in Oslo",
        "items": [
          {
            "time": "10:00",
            "title": "Waterfront walk",
            "place": "Aker Brygge",
            "type": "Walk"
          },
          {
            "time": "13:00",
            "title": "Lunch",
            "description": "A pause by the water."
          }
        ]
      }
    ]
  }
}
```

Examples are illustrative, not evidence. Shared source, security and delivery behavior is in [implemented rendering](../display/implemented-rendering.md). [Template index](README.md).
