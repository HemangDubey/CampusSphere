const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const c = require('../controllers/community');
const { optionalAuth, requireAuth, requirePermission } = require('../middleware/auth');
const { HttpError } = require('../utils/response');

// Anti-spam: writes are limited per signed-in user per minute.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.COMMUNITY_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  handler: (req, res, next) => next(new HttpError(429, 'RATE_LIMITED', 'You are doing that too quickly. Please wait a moment.'))
});
const write = [requireAuth, writeLimiter];

const router = Router();
router.get('/community/posts', optionalAuth, c.listPosts);
router.get('/community/trending', c.trending);
router.get('/community/posts/:id', optionalAuth, c.getPost);
router.post('/community/posts', write, c.createPost);
router.patch('/community/posts/:id', write, c.updatePost);
router.delete('/community/posts/:id', requireAuth, c.deletePost);
router.put('/community/posts/:id/like', write, c.like);
router.delete('/community/posts/:id/like', requireAuth, c.unlike);
router.put('/community/posts/:id/bookmark', write, c.bookmark);
router.delete('/community/posts/:id/bookmark', requireAuth, c.unbookmark);
router.post('/community/posts/:id/comments', write, c.addComment);
router.patch('/community/comments/:id', write, c.updateComment);
router.delete('/community/comments/:id', requireAuth, c.deleteComment);
router.post('/community/reports', write, c.report);

router.get('/community/groups', optionalAuth, c.listClubs);
router.post('/community/groups', write, c.createClub);
router.get('/community/groups/:id', optionalAuth, c.getClub);
router.patch('/community/groups/:id', write, c.updateClub);
router.post('/community/groups/:id/archive', write, c.archiveClub);
router.post('/community/groups/:id/join', write, c.join);
router.delete('/community/groups/:id/join', requireAuth, c.leave);
router.get('/community/groups/:id/requests', requireAuth, c.requests);
router.post('/community/groups/:id/requests/:userId', write, c.decide);
router.delete('/community/groups/:id/members/:userId', requireAuth, c.removeMember);
router.put('/community/groups/:id/members/:userId/role', write, c.setRole);

const mod = [requireAuth, requirePermission('community:moderate')];
router.get('/manage/community/reports', mod, c.reportQueue);
router.post('/manage/community/reports/:id/resolve', mod, c.resolveReport);
router.post('/manage/community/restore/:type/:id', mod, c.restore);

module.exports = router;
