const { Router } = require('express');
const leave = require('../controllers/leave');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();
router.get('/leave/rules', leave.rules);
router.get('/leave/reviewers', requireAuth, leave.reviewers);
router.post('/leave', requireAuth, leave.create);
router.get('/leave/mine', requireAuth, leave.mine);
router.get('/leave/:id', requireAuth, leave.get);
router.post('/leave/:id/withdraw', requireAuth, leave.withdraw);
router.post('/leave/:id/respond', requireAuth, leave.respond);

// Reviewers: assigned faculty, or campus/super administrators. The controller also blocks self-approval.
const reviewer = [requireAuth, requirePermission('leave:review')];
router.get('/manage/leave', reviewer, leave.queue);
router.post('/manage/leave/:id/decision', reviewer, leave.decide);

module.exports = router;
