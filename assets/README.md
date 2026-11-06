# assets/

Marketplace and documentation assets. Everything here is referenced either by the READMEs or by
`screenshots.json`, and every path is a **repository-relative** path — no external image hosts,
no CDN links.

```
assets/
  icon.svg                     design source for the market tile (not a raster)
  icon-180.png                 TODO — export from icon.svg, square, 180×180
  icon-512.png                 TODO — export from icon.svg, square, 512×512
  screenshots/
    dashboard-light-1440.jpg   dashboard, light theme
    dashboard-dark-1440.jpg    dashboard, dark theme
    focus-1440.jpg             focus timer
    tasks-1440.jpg             tasks page
```

## Market tile icon

`dsh-market` shows a square tile in the plugin list. The requirements:

- **Raster, not SVG.** PNG is the safe choice. `icon.svg` is only the design source.
- **Square.** 180×180 is enough; 512×512 covers high-DPI screens. Non-square images get cropped.
- **Hosted in this repository.** The entry uses a `raw.githubusercontent.com` URL pointing at this
  directory, so the file must be committed.

To produce the PNGs, open `icon.svg` in any vector editor or run:

```bash
# ImageMagick
magick -background none assets/icon.svg -resize 512x512 assets/icon-512.png
magick -background none assets/icon.svg -resize 180x180 assets/icon-180.png

# or Inkscape
inkscape assets/icon.svg -w 512 -h 512 -o assets/icon-512.png
```

Until the PNGs exist, leave `icon:` commented out in
[`docs/SorenLorn__dsh-otaku-study-board.yml`](../docs/SorenLorn__dsh-otaku-study-board.yml) — the
market then falls back to the repository owner's avatar.

## Screenshots

Rules that keep the market view and the READMEs in sync:

1. File names are `<page>-<theme-or-view>-<width>.jpg`, lowercase, no spaces.
2. **At most 8 images.** More than 8 will be truncated by the market, so pick the best ones.
3. Width **1440 px** matches the layout the tests assert against; keep it when re-shooting.
4. Update **both** places after adding an image: the table in `README.md` / `README.zh.md`, and the
   array in `screenshots.json`.

`screenshots.json` lives next to `package.json` and is a plain JSON array of relative paths. JSON has
no comment syntax, so the format is documented here instead:

```jsonc
[
  // relative to the repository root, always forward slashes
  "assets/screenshots/dashboard-light-1440.jpg",
  "assets/screenshots/dashboard-dark-1440.jpg",
  "assets/screenshots/focus-1440.jpg",
  "assets/screenshots/tasks-1440.jpg"
  // 5..8 — add more entries here; order is the display order
]
```

Drop a new file into `assets/screenshots/`, add its path to that array, and `dsh-market` picks it up
on the next refresh. Nothing else needs to change.

## 中文摘要

- 图标：市场要**方形 PNG**（180×180 或 512×512），`icon.svg` 只是设计源文件，导出后放进本目录。
  在 PNG 生成之前，投稿 yml 里的 `icon:` 保持注释状态，市场会回退到作者头像。
- 截图：命名 `<页面>-<主题或视图>-<宽度>.jpg`，**最多 8 张**，宽度 1440。新增截图后要同时改
  `README.md` / `README.zh.md` 的表格和 `screenshots.json` 的数组。
- `screenshots.json` 是纯数组，JSON 不支持注释，所以格式说明写在本文件里。路径一律用仓库内相对
  路径，不要用图床。
