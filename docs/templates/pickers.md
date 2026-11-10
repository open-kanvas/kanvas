# Icon and font pickers

**Status:** Implemented in 0.37.0. The agent shows labelled options, the person picks by voice ("number 3", "the Lucide one"), and the agent uses the exact name in code.

## Where the assets come from

The custom `html` template stays strict: it cannot load anything from outside. The pickers are Kanvas's own templates and ask the **Kanvas server** for assets. Viewers' browsers never contact a third party.

The server builds every outbound address itself from a fixed host (`cdn.jsdelivr.net`, and `data.jsdelivr.com` for file listings), an allowlisted package at a pinned version, and name parts that passed a strict pattern. A view, an agent or a browser can name a set and an icon, or a font family id and weight. It can never supply a URL, host, scheme or path. Redirects are refused, responses are size-capped (64 KB per icon, 400 KB per font) and checked (sanitised SVG, WOFF2 signature), requests time out after 8 seconds, and the in-memory cache is bounded at 48 MB. Assets are served only to signed-in browsers, with `nosniff` and a locked-down content security policy.

| Set | Package | Licence | Styles |
| --- | --- | --- | --- |
| Lucide | lucide-static 1.70.0 | ISC | outline |
| Heroicons | heroicons 2.2.0 | MIT | outline, solid, mini, micro |
| Phosphor | @phosphor-icons/core 2.1.1 | MIT | regular, thin, light, bold, fill, duotone |
| Tabler | @tabler/icons 3.51.0 | MIT | outline, filled |
| Material Symbols | @material-symbols/svg-400 0.48.3 | Apache-2.0 | outlined, rounded, sharp, each also filled |

Fonts come from the `@fontsource-variable/<family>` and `@fontsource/<family>` packages (major version 5), Latin subset including Nordic letters. 28 curated families are listed by `kanvas.fonts.list`.

**Variable fonts.** 21 of the 28 curated families publish a variable edition: one file covers the family's whole weight range, so a weights view or a pairing costs one request per family. They are Inter, Roboto, Open Sans, Montserrat, DM Sans, Work Sans, Source Sans 3, Nunito, Playfair Display, Merriweather, Lora, Source Serif 4, EB Garamond, Libre Baskerville, JetBrains Mono, Fira Code, Source Code Pro, Oswald, Space Grotesk, Caveat and Dancing Script. The other seven (Lato, Poppins, IBM Plex Mono, Bebas Neue, Archivo Black, Pacifico, Lobster) are published as static weights only and are served one weight per file; that is how those typefaces exist, not a Kanvas limit. `kanvas.fonts.list` marks each family `variable` with its `weightRange`.

Any other family id may be named as a static weight; the server reads that package's declared licence first and serves it only when it is OFL-1.1, Apache-2.0, UFL-1.0 or MIT.

Licences, paths and weight ranges above were checked against the published packages on 2026-11-10.

## The wider catalogue (Iconify)

The five core sets work on every installation. The wider catalogue (more than a hundred further open-source collections) is served through an **Iconify API that the operator runs** ([iconify/api](https://github.com/iconify/api) is the open-source server). Set `KANVAS_ICONIFY_API` to its base address, for example `http://127.0.0.1:3000`. It is unset by default; then the catalogue does not exist on that installation and `kanvas.icons.search` says so when it is asked for.

- The address is installation configuration. A view, an agent or a browser can name a collection prefix and an icon name, both strictly patterned; never a host or a path.
- Only collections whose declared licence is MIT, ISC, Apache-2.0, CC0-1.0, Unlicense, BSD-2-Clause, BSD-3-Clause, 0BSD or MIT-0 are listed or served. Attribution-required (CC BY), share-alike, copyleft and non-commercial collections are refused, as are collections without a declared licence. The licence is read from the API's own `/collections` answer, refreshed every ten minutes.
- Multi-colour collections (emoji, logos, flags) are left out: the picker draws an icon as one shape in the current colour. An icon that needs gradients or references is refused by the same SVG sanitiser as every other icon.
- Collections that repeat a core set (Lucide, Heroicons, Phosphor, Tabler, Material Symbols) are left out.
- The same limits apply as for the CDN: no redirects, 8 second timeout, 64 KB per icon, sanitised SVG, bounded cache, signed-in browsers only.

A catalogue icon is written the way Iconify writes it, `{"set":"iconify","name":"mdi:cog-outline"}`, and that name is the exact name for code. Against the public Iconify API on 2026-11-10 this allowlist left 126 of 276 collections; the public API was used only to check the response format, it is not a default.

## Operations and templates

- `kanvas.icons.search {query, sets?, limit?}` returns exact ids (`set:name`, or `collection:name` for the catalogue), the available styles and a ready `icon-picker` view. With no `sets` it searches the five core sets and, where one is configured, the catalogue; `sets: ["iconify"]` asks for the catalogue only, and a query that starts with collection prefixes and a colon (`"mdi: settings"`, `"mdi,carbon: arrow left"`) searches only those collections. Lucide's published tag list makes concept words such as "weather" find `sun`.
- `kanvas.fonts.list {category?}` or `{family}` returns ids, weights, whether the family is variable with its weight range, and licence.
- `icon-picker` modes: `candidates`, `sets`, `variants` (every style of a core-set icon; a catalogue icon is one drawing), `context`.
- `font-picker` modes: `samples`, `pairings` (fonts two at a time: heading, then body), `weights` (every weight of the first family), `context`. Sample text is supplied by the agent or the person.

## Self-hosting without the proxy

Set `KANVAS_PICKER_PROXY=false` to make no outbound requests. Then only files under `KANVAS_PICKER_CACHE_DIR` are served:

```
<dir>/icons/<set>/<package path>          e.g. icons/lucide/icons/settings.svg
<dir>/icons/<set>/index.json              JSON array of the package's file paths, for search
<dir>/icons/lucide/tags.json              optional
<dir>/fonts/<family>/<family>-latin-<weight>-normal.woff2   static families
<dir>/fonts/<family>/LICENCE.txt          one line: OFL-1.1, Apache-2.0, UFL-1.0 or MIT
<dir>/fonts/<family>/<family>-latin-wght-normal.woff2   variable families
```

With the proxy off and nothing pre-cached, search answers that the sets are unavailable instead of failing.

### Filling the directory

```
npm run picker-precache -- <dir>                       # the 28 curated families (46 files, about 1.3 MB)
npm run picker-precache -- <dir> --icons=lucide,heroicons
npm run picker-precache -- <dir> --icons=all --variants=all --concurrency=8
```

Run it once where the package CDN can be reached (it uses the same allowlist, pinned versions, size limits, SVG sanitiser, font signature and licence check as the server) and copy the directory, or run it on the server before switching the proxy off. Fonts are always the curated set: one variable file where the family has one, otherwise each static weight, plus the licence line. Icons are stored only for the sets named; by default each set's default style, with `--variants=all` every style (all five sets in every style is roughly 45,000 small files). The stored `index.json` lists only what was stored, so an offline search never offers an icon it cannot draw. `KANVAS_ICONIFY_API` is independent of `KANVAS_PICKER_PROXY`: an Iconify API you run yourself is not a third party.
