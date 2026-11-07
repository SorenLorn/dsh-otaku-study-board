# assets/

Marketplace and documentation assets. Every path in this directory is repository-relative; no
external image hosts and no CDN links are used anywhere in the project.

```
assets/
  icon.svg                     design source for the market tile
  icon-512.png                 512×512 raster tile (referenced by the market entry)
  icon-180.png                 180×180 fallback tile
  screenshots/
    dashboard-light-1440.jpg   dashboard, light theme
    dashboard-dark-1440.jpg    dashboard, dark theme
    focus-1440.jpg             focus timer
    tasks-1440.jpg             tasks page
```

## Market tile

`dsh-market` renders a square tile beside the plugin name. The requirements are:

- **Raster.** PNG is required; SVG is not supported. `icon.svg` is the design source only.
- **Square.** 180×180 is the minimum; 512×512 covers high-DPI displays. Non-square images are cropped.
- **Committed to this repository.** The entry references the file through a `raw.githubusercontent.com`
  URL, so the asset must be in the repository, not in a release attachment.

Both PNGs are rendered from `icon.svg` and committed. When the artwork changes, update the SVG and
re-render both sizes:

```bash
magick -background none assets/icon.svg -resize 512x512 assets/icon-512.png
magick -background none assets/icon.svg -resize 180x180 assets/icon-180.png

# or
inkscape assets/icon.svg -w 512 -h 512 -o assets/icon-512.png
inkscape assets/icon.svg -w 180 -h 180 -o assets/icon-180.png
```

The tile is already wired up in [`docs/SorenLorn__dsh-otaku-study-board.yml`](../docs/SorenLorn__dsh-otaku-study-board.yml).

## Screenshots

Conventions that keep the market view and the READMEs consistent:

1. File names follow `<page>-<theme-or-view>-<width>.jpg`, lowercase, no spaces.
2. **Eight images maximum.** The market truncates anything beyond that, so keep only the strongest.
3. Capture at **1440 px** width — the same viewport the browser tests assert against.
4. Adding an image requires two updates: the table in `README.md` / `README.zh.md`, and the array in
   `screenshots.json`.

`screenshots.json` sits next to `package.json` and is a plain JSON array of relative paths. JSON
does not support comments, so the format is documented here:

```jsonc
[
  // repository-relative, always forward slashes
  "assets/screenshots/dashboard-light-1440.jpg",
  "assets/screenshots/dashboard-dark-1440.jpg",
  "assets/screenshots/focus-1440.jpg",
  "assets/screenshots/tasks-1440.jpg"
  // entries 5..8 — display order follows array order
]
```

Add the file under `assets/screenshots/`, append its path to the array, and the market picks it up on
the next refresh. No other change is required.
