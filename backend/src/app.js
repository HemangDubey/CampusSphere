const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { checkOrigin } = require('./middleware/auth');
const securityHeaders = require('./middleware/securityHeaders');
const path = require('path');
const config = require('./config');
const api = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Clean URLs mapped to their page files.
const PAGES = {
  '/dashboard': 'dashboard.html',
  '/events': 'events.html',
  '/travel': 'travel.html',
  '/resources': 'resources.html',
  '/services': 'resources.html',
  '/healthcare': 'healthcare.html',
  '/courses': 'courses.html',
  '/checkout': 'checkout.html',
  '/employees': 'employees.html',
  '/assistant': 'assistant.html',
  '/labs': 'labs.html',
  '/labs/mouse': 'mouse-lab.html',
  '/labs/keyboard': 'keyboard-lab.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/forgot-password': 'forgot-password.html',
  '/reset-password': 'reset-password.html'
};

function createApp() {
  const app = express();
  const page = (name) => path.join(config.frontendRoot, 'pages', name);
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1); // correct client IPs for rate limiting behind a host's proxy
  app.use(securityHeaders);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', checkOrigin);

  app.use('/api', api);
  app.use('/api', notFound);

  // Frontend (static host used in development and single-server deployments).
  app.use(express.static(config.frontendRoot));
  app.get('/', (req, res) => res.sendFile(path.join(config.frontendRoot, 'index.html')));
  app.get(/^\/[^/.]+(\/[^/.]+)?\/?$/, (req, res, next) => {
    const route = req.path.replace(/\/+$/, '');
    if (PAGES[route]) return res.sendFile(page(PAGES[route]));
    return next();
  });
  app.use((req, res) => res.status(404).sendFile(page('404.html')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
