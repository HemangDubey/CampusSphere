const config = require('../config');
const { HttpError } = require('../utils/response');

function notFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Resource not found.'));
}

// Centralised error responses. Stack traces and internals never reach the client in production,
// and request bodies (which may contain passwords) are never logged.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message;
  if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Request body is not valid JSON.'; }
  else if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.'; }
  else if (!(err instanceof HttpError)) { status = 500; code = 'INTERNAL_ERROR'; message = 'Something went wrong on our side.'; }
  if (!(err instanceof HttpError) && status >= 500) console.error(`[error] ${req.method} ${req.path}: ${err.message}${config.isProduction ? '' : `\n${err.stack}`}`);
  const error = { code, message };
  if (err.details) error.details = err.details;
  res.status(status).json({ success: false, error });
}

module.exports = { notFound, errorHandler };
