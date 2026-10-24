// Generates the thin HTML shells for the application pages (frontend/pages/*.html) from backend/src/pageRoutes.js.
// Each page is just <main data-view> plus one ES module in frontend/js/pages/. The committed output is what gets served;
// re-run this script only when a route is added:  node backend/scripts/make-app-pages.js
const fs = require('fs');
const path = require('path');
const { APP_PAGES } = require('../src/pageRoutes');

const out = path.resolve(__dirname, '../../frontend/pages');
for (const p of APP_PAGES) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${p.title} | CampusSphere</title>
  <meta name="theme-color" content="#fdf8f3">
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/app.css">${p.extraCss ? `\n  ${p.extraCss.map((c) => `<link rel="stylesheet" href="/css/${c}.css">`).join('\n  ')}` : ''}
</head>
<body class="app-page">
  <a class="skip-link" href="#main">Skip to content</a>
  <main id="main" class="page" data-view>
    <div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading…</div>
  </main>
  <script type="module" src="/js/pages/${p.js}.js"></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(out, p.file), html);
}
console.log(`written ${APP_PAGES.length} pages`);
