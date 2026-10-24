# CampusSphere frontend

Plain HTML, CSS and ES-module JavaScript. There is no build step, bundler or framework, and therefore no
frontend environment file. In development the backend serves this folder.

```
index.html          landing page (approved design; do not restyle)
pages/              one HTML file per route (see backend/src/app.js for the URL map)
css/                tokens.css, base.css, components.css (design system); page CSS: main, auth, dashboard, campus, labs, assistant
js/                 layout.js (nav/footer), api.js (API client), validators.js, forms.js, ui.js, one module per page
vendor/             bootstrap-5.3.3 (local copy, used only by pages/bootstrap-demo.html)
vercel.json         optional template for a split deployment (untested)
```

## Configuration

`js/config.js` holds the only runtime setting, `apiBase`. Leave it empty when the API is on the same origin
or proxied through the host (recommended). Everything in this folder is public: never put a secret here.

## Design system

Full notes in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); live reference at `/pages/styleguide.html`. Pages load `tokens.css`, `base.css`, `components.css`, then their own
CSS. Bootstrap is never loaded globally.
