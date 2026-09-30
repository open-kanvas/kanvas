# Map tiles

Maps require actual supplied coordinates, routes or polygon geometry. Kanvas does not geocode names or calculate road routes. The caller can obtain geometry from an external authorized provider and publish it.

The default browser tile endpoint is OpenStreetMap’s public tile service. Observe its usage policy; larger deployments should configure a suitable provider using `KANVAS_MAP_TILE_URL`, `KANVAS_MAP_ATTRIBUTION`, and `KANVAS_MAP_ATTRIBUTION_URL`. The tile URL must be a credential-free HTTPS template containing `{z}`, `{x}` and `{y}` with no query or user information. Provider credentials belong behind a separately managed service, never in browser-visible URLs.

Without network tiles, supplied geometry remains source content, not proof that remote imagery loaded. Attribution is retained. GeoIP-based session topology uses coarse estimates, not a precise location claim.
