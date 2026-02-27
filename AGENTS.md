# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **static personal academic website** (HTML/CSS/JS) packaged as `XinShuo-ph.github.io-master.zip`. There is no build system, package manager, or automated test suite.

### Running the site locally

1. Extract the zip: `unzip -o XinShuo-ph.github.io-master.zip`
2. Serve with Python: `cd XinShuo-ph.github.io-master && python3 -m http.server 8080`
3. Open `http://localhost:8080/index.html` in a browser.

### Key files

- `index.html` — English homepage
- `index_cn.html` — Chinese homepage
- `assets/css/main.css` — compiled CSS (pre-built from Sass sources in `assets/sass/`)
- `assets/js/main.js` — site JavaScript (jQuery-based)
- `_config.yml` — Jekyll config (only used by GitHub Pages, not required locally)

### Notes

- No lint, test, or build commands exist. Validation is done by visually inspecting the site in a browser.
- The SCSS sources in `assets/sass/` are pre-compiled; editing them requires a Sass compiler, but the compiled `main.css` is already included.
- The site uses the "Solid State" HTML5 UP template with jQuery, Font Awesome, and custom JS.
