# CampusSphere design system notes

Moved from the original README so the project README can describe the whole app. The live reference is `/pages/styleguide.html`.

## Tokens, files and conventions

Live reference: **http://localhost:3000/pages/styleguide.html**

| File | Role | Loaded by |
| --- | --- | --- |
| `css/tokens.css` | All design tokens (colour, type, spacing, radius, shadow, layout, motion, focus, z-index) | every page |
| `css/base.css` | Reset, typography classes (`.t-hero`, `.t-page-title`, `.display`, `.t-h2` ...), layout utilities (`.container`, `.section`, `.stack`, `.cluster`, `.grid--N`, `.card-grid`, `.aspect--*`), reveal-up motion, reduced motion | every page |
| `css/components.css` | Nav, footer, buttons, links, tags/status, panels, media frames, forms, notices, spinner/skeleton, empty state | every page |
| `css/main.css` | Landing page composition only | `index.html` only |
| `css/bootstrap-theme.css` | Rethemes Bootstrap with CampusSphere tokens | Bootstrap pages only |
| `js/layout.js` | `renderNav`, `renderFooter`, `initReveal` | every page |
| `js/forms.js` | `enhanceForm`, `validateField`, `setLoading` (accessible native validation) | pages with forms |

Every new page starts with:

```html
<link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<!-- then the page's own CSS -->
```

Conventions:
- Use the descriptive tokens (`--color-text-primary`, `--spacing-md`, `--radius-lg`, ...). The short names (`--bg`, `--ink`, `--accent` ...) are aliases kept for the landing page.
- Headings use the editorial pattern: uppercase heavy type, with an `<em>` word that becomes the lowercase italic blush accent.
- The blush pink (`--color-accent-pink`) is for fills and large display type. For small text on light backgrounds use `--color-accent-pink-strong`, which has enough contrast.
- Statuses and errors always include text or an icon, never colour alone.
- Component classes are named `.button`, `.panel`, `.notice` and `.aspect` (not `.btn`, `.card`, `.alert` or `.ratio`) so they never collide with Bootstrap.

## Bootstrap (local, for coursework demos)

Bootstrap **5.3.3** (MIT) is vendored at `frontend/vendor/bootstrap-5.3.3/` (minified CSS and JS bundle with Popper, plus source maps). Nothing loads it by default. The landing page never does. On pages that need it, use this order:

```html
<link rel="stylesheet" href="/vendor/bootstrap-5.3.3/css/bootstrap.min.css">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/bootstrap-theme.css">
<script src="/vendor/bootstrap-5.3.3/js/bootstrap.bundle.min.js" defer></script>
```

`frontend/pages/bootstrap-demo.html` is a working starter (grid, form validation, table, badges, modal). For standalone HTML coursework opened without the server, use relative paths such as `../vendor/bootstrap-5.3.3/css/bootstrap.min.css`.
