# Colour

**Status:** Implemented in 0.37.0. One template with eight modes for choosing colours by looking and by voice. Every swatch has a speakable label and an exact value; there is no colour-picker widget and nothing to click.

| Mode | Shows |
| --- | --- |
| `options` | 2 to 8 candidates (A, B, C…) as large swatches with a small preview and hex |
| `variations` | lighter, darker, warmer, cooler, muted and vivid around one colour, with the original marked |
| `shades` | a palette as families by shades: `tailwind`, `radix`, `radix-dark`, `open-color`, or your own `custom` families |
| `named` | CSS colour names, one family at a time (`blues`, `greens`, …) |
| `harmony` | complementary, analogous, triadic, split complementary and tetradic colours with a hue wheel |
| `contrast` | backgrounds by text colours with the WCAG ratio and AAA / AA / large only / fail |
| `roles` | a 12-step scale with each step's job and a mini interface built from those steps |
| `theme` | one seed as tonal palettes (primary, secondary, tertiary, neutral, error) and a light and a dark scheme |

A colour is `#rrggbb`, a CSS colour name, or a palette reference: `tailwind:amber-400`, `radix:blue-9`, `radix-dark:blue-9`, `open-color:blue-6`. Palette values are the published ones (`src/shared/colour-palettes.ts`, generated from tailwindcss 3.4.17, @radix-ui/colors 3.0.0, open-color 1.9.1 and color-name 1.1.4, all MIT). Variations, harmonies, tonal scales and contrast are computed in OKLCH and WCAG relative luminance in `src/shared/colour.ts`, so an agent names a palette or a base colour and never types palette values from memory.

In a shade grid every cell carries a speakable label. A grid of your own `custom` families prints each cell's shade label inside the cell (custom families need not share column names), and `cellLabels: "hex"` adds the value under it. A built-in palette has the same shades in every row, so it is labelled on the axes by default; `cellLabels: "shade"` or `"hex"` prints in the cells there too, and `"none"` turns printing off. Printed labels are sized from their own cell and never wrap or overflow. Where a cell is too narrow to print a seven-character value legibly (a wide palette on a phone held upright), only the shade is printed; the value stays in the cell's accessible name and in the stored view.

Mark a choice without republishing by patching `data.selected` with swatch labels. The exact values of what is shown are in the stored view (`kanvas.display.current`). The seed theme is an OKLCH tonal scale in the spirit of Material Design 3; it is not the HCT algorithm and its values differ from Material's own tools. A dedicated token-export operation is not part of this release.
