const { Router } = require('express');
const resources = require('../controllers/resources');
const requests = require('../controllers/serviceRequests');
const { optionalAuth, requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// Directory (public) and personal lists. Fixed paths come before ":id".
router.get('/resource-categories', resources.categories);
router.get('/resources', optionalAuth, resources.list);
router.get('/resources/home', optionalAuth, resources.home);
router.get('/resources/bookmarks', requireAuth, resources.bookmarks);
router.get('/reading-list', requireAuth, resources.readingList);
router.get('/reading-list/export.csv', requireAuth, resources.exportReading);
router.put('/reading-list-order', requireAuth, resources.reorderReading);
router.patch('/reading-list/:id', requireAuth, resources.updateReading);
router.get('/resources/:id', optionalAuth, resources.get);
router.put('/resources/:id/bookmark', requireAuth, resources.addBookmark);
router.delete('/resources/:id/bookmark', requireAuth, resources.removeBookmark);
router.put('/reading-list/:id', requireAuth, resources.setReading);
router.delete('/reading-list/:id', requireAuth, resources.removeReading);
router.post('/resources/:id/report', requireAuth, resources.report);

// Service requests: requester side
router.post('/service-requests', requireAuth, requests.create);
router.get('/service-requests/mine', requireAuth, requests.mine);
router.get('/service-requests/:id', requireAuth, requests.get);
router.post('/service-requests/:id/respond', requireAuth, requests.respond);
router.post('/service-requests/:id/cancel', requireAuth, requests.cancel);

// Service requests: reviewers (faculty see only requests assigned to them; administrators see all)
const staff = [requireAuth, requirePermission('request:review')];
router.get('/manage/requests', staff, requests.queue);
router.get('/manage/requests/handlers', staff, requests.handlers);
router.post('/manage/requests/:id/assign', staff, requests.assign);
router.post('/manage/requests/:id/transition', staff, requests.transition);

module.exports = router;
