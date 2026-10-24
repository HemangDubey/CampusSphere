// One JSON envelope for every API response:
//   success: { success: true,  data, message? }
//   failure: { success: false, error: { code, message, details? } }
function ok(res, data = null, { status = 200, message } = {}) {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ok, HttpError };
