const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../utils/response');
const controller = require('../controllers/ai');

// Signed-in users only (each call costs money), limited per user per minute.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.aiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id, // requireAuth runs first, so a user is always present
  handler: (req, res, next) => next(new HttpError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a moment.'))
});

const router = Router();
router.post('/chat', requireAuth, limiter, controller.chat);
module.exports = router;
