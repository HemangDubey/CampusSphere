const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { checkOrigin } = require('./middleware/auth');
const securityHeaders = require('./middleware/securityHeaders');
const path = require('path');
const config = require('./config');
const api = require('./routes');
const { match } = require('./pageRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Old URLs that moved. Kept so bookmarks and links keep working.
const REDIRECTS = { '/services': '/resources', '/labs': '/coursework' };

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
  app.get(/^\/[^.]*$/, (req, res, next) => {
    const route = req.path.replace(/\/+$/, '') || '/';
    if (REDIRECTS[route]) return res.redirect(301, REDIRECTS[route]);
    const found = match(route);
    return found ? res.sendFile(page(found.file)) : next();
  });
  app.use((req, res) => res.status(404).sendFile(page('404.html')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
