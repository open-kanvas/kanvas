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

Fonts come from the `@fontsource/<family>` packages (major version 5), Latin subset including Nordic letters. 28 curated families are listed by `kanvas.fonts.list`. Any other family id may be named; the server reads that package's declared licence first and serves it only when it is OFL-1.1, Apache-2.0, UFL-1.0 or MIT.

Licences and paths above were checked against the published packages on 2026-11-10. A broader Iconify catalogue and variable font files are not part of this release.

## Operations and templates

- `kanvas.icons.search {query, sets?, limit?}` returns exact `set:name` ids, the available styles and a ready `icon-picker` view. Lucide's published tag list makes concept words such as "weather" find `sun`.
- `kanvas.fonts.list {category?}` or `{family}` returns ids, weights and licence.
- `icon-picker` modes: `candidates`, `sets`, `variants`, `context`.
- `font-picker` modes: `samples`, `pairings` (fonts two at a time: heading, then body), `weights` (every weight of the first family), `context`. Sample text is supplied by the agent or the person.

## Self-hosting without the proxy

Set `KANVAS_PICKER_PROXY=false` to make no outbound requests. Then only files under `KANVAS_PICKER_CACHE_DIR` are served:

```
<dir>/icons/<set>/<package path>          e.g. icons/lucide/icons/settings.svg
<dir>/icons/<set>/index.json              JSON array of the package's file paths, for search
<dir>/icons/lucide/tags.json              optional
<dir>/fonts/<family>/<family>-latin-<weight>-normal.woff2
<dir>/fonts/<family>/LICENCE.txt          one line: OFL-1.1, Apache-2.0, UFL-1.0 or MIT
```

With the proxy off and nothing pre-cached, search answers that the sets are unavailable instead of failing. A script that fills this directory is not shipped in this release.
