const { Router } = require('express');

// Register one router per module here as the API grows.
const api = Router();
api.use(require('./health'));
api.use(require('./newsletter'));
api.use('/ai', require('./ai'));
api.use('/auth', require('./auth'));
api.use(require('./campus'));
api.use(require('./services'));
module.exports = api;
