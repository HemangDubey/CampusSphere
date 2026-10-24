const { Router } = require('express');
const { ok, HttpError } = require('../utils/response');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const router = Router();

// Demonstration only: nothing is stored or emailed until a mailing list is configured.
router.post('/newsletter', (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!EMAIL.test(email) || email.length > 254) return next(new HttpError(400, 'VALIDATION_ERROR', 'Please enter a valid email.'));
  return ok(res, null, { status: 201, message: 'Thanks. Subscriptions are not connected to a mailing list yet, so nothing was stored.' });
});
module.exports = router;
