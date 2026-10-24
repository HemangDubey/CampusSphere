const { Router } = require('express');
const me = require('../controllers/me');
const games = require('../controllers/games');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = Router();
router.get('/notifications', requireAuth, me.notifications);
router.get('/notifications/unread-count', requireAuth, me.unreadCount);
router.post('/notifications/read-all', requireAuth, me.markAllRead);
router.post('/notifications/:id/read', requireAuth, me.markRead);
router.get('/activity', requireAuth, me.activity);
router.get('/dashboard', requireAuth, me.dashboard);
router.get('/announcements', me.announcements);

router.get('/games', games.list);
router.post('/games/scores', requireAuth, games.submit);
router.get('/games/scores/mine', requireAuth, games.mine);
router.get('/games/leaderboard', optionalAuth, games.leaderboard);

module.exports = router;
