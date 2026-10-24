const { Router } = require('express');
const events = require('../controllers/events');
const manage = require('../controllers/eventsManage');
const { optionalAuth, requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// Students. "mine" is declared before ":id" so it is not read as an id.
router.get('/events', optionalAuth, events.list);
router.get('/events/mine', requireAuth, events.mine);
router.get('/events/:id', optionalAuth, events.get);
router.post('/events/:id/register', requireAuth, events.register);
router.delete('/events/:id/register', requireAuth, events.cancel);

// Organizers and administrators (organizers are limited to their own events inside the controller).
const staff = [requireAuth, requirePermission('event:manage')];
router.get('/manage/events', staff, manage.list);
router.post('/manage/events', staff, manage.create);
router.get('/manage/events/:id', staff, manage.get);
router.put('/manage/events/:id', staff, manage.update);
router.delete('/manage/events/:id', staff, manage.remove);
router.post('/manage/events/:id/publish', staff, manage.publish);
router.post('/manage/events/:id/unpublish', staff, manage.unpublish);
router.post('/manage/events/:id/cancel', staff, manage.cancel);
router.get('/manage/events/:id/registrations', staff, manage.registrations);
router.get('/manage/events/:id/export.csv', staff, manage.exportCsv);
router.post('/manage/events/:id/registrations/:regId/attendance', staff, manage.attendance);

module.exports = router;
