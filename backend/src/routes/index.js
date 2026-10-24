const { Router } = require('express');

// Register one router per module here as the API grows.
const api = Router();
api.use(require('./health'));
api.use(require('./newsletter'));
api.use('/ai', require('./ai'));
api.use('/auth', require('./auth'));
api.use(require('./events'));
api.use(require('./travel'));
api.use(require('./resources'));
api.use(require('./leave'));
api.use(require('./healthcare'));
api.use(require('./me'));
api.use(require('./admin'));
api.use(require('./services'));
module.exports = api;
