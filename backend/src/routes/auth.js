const { Router } = require('express');
const c = require('../controllers/auth');
const { requireAuth, authLimiter } = require('../middleware/auth');

const router = Router();
router.post('/register', authLimiter, c.register);
router.post('/login', authLimiter, c.login);
router.post('/forgot-password', authLimiter, c.forgotPassword);
router.post('/reset-password', authLimiter, c.resetPassword);
router.post('/logout', requireAuth, c.logout);
router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, c.updateProfile);
module.exports = router;
