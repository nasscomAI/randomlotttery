# Lucky Draw

A polished, browser-based CSV lucky-draw app with an animated selection flow.

## Features

- Drag-and-drop CSV upload with clear validation
- Participant review before the draw
- Animated, cryptographically random selection
- Celebratory winner reveal and redraw option
- Responsive design for desktop and mobile
- Private by design: CSV contents never leave the browser

## Run locally

Open `index.html` in a browser, or serve the directory with any static web server.

The CSV must contain `Name` and `Number` headers. A sample file can be downloaded from the app.

Five test files are available in the [`samples`](samples) folder, including quoted-name and alternate-header examples.

## Publish with GitHub Pages

1. Create a public GitHub repository and push these files to its `main` branch.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The included workflow will deploy the site after each push to `main`.

The live URL will appear in the deployment summary and normally follows:
`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`
