# Third-party licences and distribution index

Kanvas source is Apache-2.0; third-party material keeps its own terms. This distribution index identifies those materials and the notices to retain. It is not legal advice or a blanket grant of third-party rights. Keep this index, NOTICE and all accompanying texts in source and binary distributions.

## npm code (direct, transitive, client and server)

[npm-inventory.json](npm-inventory.json) lists every locked package path, version, scope, source tarball, integrity and available notice. [dependencies/](dependencies/) contains the actual installed licence/NOTICE texts (trailing whitespace normalized; wording preserved) (including embedded upstream notices), not just SPDX labels. Runtime entries include server dependencies and client libraries; development entries cover build/test tooling and optional platform binaries. This deliberately over-includes notices rather than guessing that a bundler removed a component. Non-installed platform packages are identified separately and must retain their upstream notices if shipped on that platform.

MIT, ISC, BSD and Apache components permit redistribution with their conditions and notices. **web-push is MPL-2.0**, not Apache-2.0: retain its licence and make the covered source available when distributing it, including any changes. The locked npm source tarball is recorded in the inventory; the server uses this dependency externally rather than relicensing it. Lightning CSS and its native binaries are MPL-2.0 build tools; caniuse-lite is CC-BY-4.0 build-time data. These do not turn Kanvas into an all-Apache distribution. If distributing development dependencies, their obligations still apply. Native binaries, Chromium and operating-system packages may include further embedded third-party notices: preserve those upstream distributions and source-offer obligations, not just this JavaScript inventory.

KaTeX code and the bundled KaTeX font distribution retain [katex-MIT.txt](katex-MIT.txt); the font project's additional [upstream MIT notice](dependencies/KaTeX-fonts--UPSTREAM-LICENSE.txt) is included. Built browser assets carry a same-directory THIRD-PARTY-NOTICES.txt containing dependency texts. Server installations must retain node_modules licence files as well as this index.

[asset-inventory.json](asset-inventory.json) enumerates tracked asset paths and SHA-256 digests, including screenshots and sample media; this records scope, not a grant of rights.

## Bundled/copied assets and data

| Material | Terms and provenance | Notice location |
| --- | --- | --- |
| Inter variable font | SIL OFL-1.1; google/fonts; source digest recorded | [public/fonts/README.txt](../../public/fonts/README.txt), [Inter-OFL.txt](../../public/fonts/Inter-OFL.txt) beside TTF |
| Patrick Hand font | SIL OFL-1.1; Patrick Wagesreiter/google/fonts | [PatrickHand-OFL.txt](../../public/fonts/PatrickHand-OFL.txt) beside TTF |
| Material Symbols signage SVGs | Apache-2.0; unmodified Google artwork, provenance manifest | [signage notice](../../public/signage/NOTICE.txt), licence and manifest beside SVGs |
| Natural Earth boundaries and derived country lookup data | Public domain; Natural Earth 5.1.2 | [geography notice](../../public/geography-NOTICE.txt), [source terms](../../src/shared/geography/LICENSE.md), [provenance](../../src/shared/geography/README.md) |
| Kenney Car Kit / Watercraft Kit scene models | CC0-1.0; prepared/normalized from upstream models; per-file source and output hashes | [scene manifest](../../public/scene-assets/manifest.json), [car licence](../../public/scene-assets/car-kit-LICENSE.txt), [watercraft licence](../../public/scene-assets/watercraft-kit-LICENSE.txt) beside GLBs |
| Three.js scene tooling/runtime | MIT, including upstream bundled notices | [scene tooling licence](../../public/scene-assets/THREE-LICENSE.txt) and npm inventory |
| Browser logos (Chrome, Edge, Firefox, Opera, Safari) | browser-logos repository MIT text does **not** grant trademark/logo rights | [notice](../../public/browser-icons/NOTICE.txt), [MIT text](../../public/browser-icons/LICENSE.txt), [source URLs/digests](../../public/browser-icons/sources.json) beside SVGs |
| Kanvas marks, favicons, application icons | Project trademarks; not granted by Apache-2.0 | [NOTICE](../../NOTICE); no third-party trademark rights claimed |
| README/documentation screenshots and rendering sample JPG/MP4 | Kanvas-authored screenshots and sample media | Project assets; third-party material depicted within content retains its own rights |
| Optional MaxMind GeoLite data | Not bundled; operator obtains and updates its own database under the current MaxMind agreement | [GeoIP notice](../../public/geoip-NOTICE.txt), [optional setup](../operations/self-hosting.md#optional-ip-geolocation) |

No separate copied code outside these data/assets and npm packages was identified by the source/header/import/script review. This is not a proof of authorship for every line. Preparation scripts retain scene source provenance; generated source structures and bundled geography are included above.

## Runtime-fetched material (not in the lockfile)

- Core picker icons: lucide-static 1.70.0 (ISC and retained Feather-derived notices), heroicons 2.2.0 (MIT), @phosphor-icons/core 2.1.1 (MIT), @tabler/icons 3.51.0 (MIT), @material-symbols/svg-400 0.48.3 (Apache-2.0). Source definitions are in src/shared/pickers.ts. Sanitizing an SVG does not waive notice requirements.
- Fontsource static/variable fonts: selected family packages at major version 5; the family list and allowed OFL-1.1/Apache-2.0 terms are runtime checked. This is not an immutable package-version inventory: arbitrary permitted family IDs and later minor versions may be fetched.
- Operator-supplied Iconify collections: allowed SPDX labels do not establish complete attribution/copyright notices. The actual installed collection and version need their own inventory.
- OpenStreetMap tiles: remotely retrieved, not bundled; ODbL data attribution and the tile provider's usage policy apply. The map renderer keeps visible attribution. Custom providers retain their own terms.
- Unsplash example image URLs and user-provided images/audio/video/HTML: links are not a grant to relicense the media. The publisher must establish rights for reuse and redistribution; arbitrary user content is outside the application's Apache licence.

## Distribution requirements

- Retain dependency licence and copyright texts, including embedded third-party notices. The native @napi-rs/lzma-linux-x64-gnu package declares MIT but its published package and documented upstream repository do not supply a licence text. The inventory records that absence; a declaration alone is not a complete copyright notice or permission to invent one. Redistributors must obtain the missing upstream notice before shipping that binary as a cleared distribution.
- Picker caches are separate runtime content, not covered completely by this locked inventory. Do not redistribute font, icon or Iconify caches without the exact upstream notices and provenance for the cached versions. An SPDX label alone is not a substitute for those notices.
- Optional GeoLite databases are not part of Kanvas source or npm dependencies. Operators must retain MaxMind attribution, meet its update/deletion requirements and review its current agreement before any redistribution.
- Browser logos identify compatible browsers; their trademarks are not licensed by the browser-logos tooling's MIT licence. Kanvas marks likewise remain project trademarks.
- MPL components retain their own licences and source-availability obligations; Kanvas does not relicense them or modify their covered files in place.

## Maintaining this inventory

After npm ci, regenerate the locked inventory and collected notices when dependencies change; compare versions and integrity against package-lock.json, preserve embedded notices and investigate missing texts. Recheck optional packages on target platforms. Build/distribution steps must carry LICENSE, NOTICE, this directory and asset-local notices; do not remove licences when pruning development dependencies. Upstream fetched text provenance is in [upstream-sources.json](upstream-sources.json).
