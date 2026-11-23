# Image display

## Default live surface

The `image` template displays one to four supplied images. A single image uses the entire available frame, with no title bar, caption footer, source widget or utility bar by default. It scales proportionally to **contain the complete image**. Empty space caused by a different screen/image aspect ratio is intentional; filling it must not crop or stretch the source unexpectedly.

`title` and every image's exact `alt` and `caption` remain in the validated/stored view. Hiding decorative metadata does not delete it or change the image. Alt text remains available to assistive technology, including an explicitly empty alt. Views carry no `source` object and no source/info affordance (removed in 0.38.0).

## Explicit presentation options

Top-level view flags are independent and default to false:

- `showTitle: true` displays the supplied title.
- `showCaption: true` displays supplied captions verbatim in a readable, bounded caption area. Long captions can be scrolled; their text is not truncated.
- `showControls: true` provides an overlaid “Open original” link for each safe source URL. It does not reserve a footer.

Presentation slides inherit showCaption and showControls from their deck unless explicitly overridden; no source-label fields exist. Titles are opted into per view, not repeated from a deck on every slide.

## Galleries and explicit crops

All supplied gallery images remain available, in source order. The default grid uses the frame without decorative gutters. Tap/click an image, or focus it and press Enter/Space, to enlarge it. Previous/next/all-images controls overlay the focused image; Left/Right navigate and Escape returns to the complete gallery. These are intrinsic access controls and remain available without `showControls`. Returning to the gallery restores focus to the enlarged image. All original image nodes stay mounted while navigating within a gallery; a replacement gallery resets stale selection.

An image may include a normalized `crop: {x, y, width, height}`. The schema requires positive dimensions and a region entirely within the source. Only that explicit region is cropped; its own aspect ratio is preserved and contained within the available frame. There is no implicit `cover`, fill, or arbitrary `fit` option. The original image URL, natural dimensions and crop remain available for source-coordinate canvas selection.

```json
{
  "version": 1,
  "template": "image",
  "title": "Original scan",
  "data": {
    "images": [{
      "url": "/api/assets/your-image-id",
      "alt": "Description of the complete supplied image",
      "caption": "Retained caption; not drawn unless showCaption is true."
    }]
  }
}
```

## Loading and failure

For collections of up to **256 images**, use `image-gallery`. Its default grid uses a 2×2 arrangement for four images, and three columns on wide screens/two columns on tall screens for six. `columns` (1–16) explicitly overrides the automatic layout. Titles and captions are opt-in per image and centred with that image. Click/tap or Enter/Space enlarges an image; Back or Escape returns to the grid and restores focus. `mode: "carousel"` provides previous/next buttons, keyboard navigation and touch swipes, including for anonymous public-session viewers. Owner broadcast navigation reaches public viewers immediately and survives their reload; a public viewer's local browsing does not move everyone else.

Titles and captions are hidden unless the corresponding per-image `showTitle` or `showCaption` flag is true. Their original values remain stored. Every image remains contained rather than cropped.

Safe external URLs and protected KANVAS asset URLs retain their existing access checks. Each actual image must finish loading with real natural dimensions before the display is acknowledged as ready, including every image in a gallery. An unavailable, corrupt or timed-out image is not a successful render. While a replacement is loading or fails, the viewer retains the previous successfully displayed frame; its image-only geometry remains full-bleed.

See the [template index](README.md) for shared planning boundaries and related categories.
