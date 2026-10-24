const { Router } = require('express');
const a = require('../controllers/admin');
const { requireAuth, requirePermission: need } = require('../middleware/auth');

const router = Router();
router.use('/admin', requireAuth);

router.get('/admin/users', need('user:manage'), a.users);
router.patch('/admin/users/:id', need('user:manage'), a.updateUser);
router.get('/admin/role-requests', need('user:manage'), a.roleRequests);
router.post('/admin/role-requests/:id/decision', need('user:manage'), a.decideRoleRequest);
router.get('/admin/audit', need('audit:view'), a.audit);
router.get('/admin/reports', need('report:view'), a.reports);

const content = need('content:manage');
router.get('/admin/destinations', content, a.destinations);
router.post('/admin/destinations', content, a.createDestination);
router.put('/admin/destinations/:id', content, a.updateDestination);
router.delete('/admin/destinations/:id', content, a.deleteDestination);
router.get('/admin/announcements', content, a.announcements);
router.post('/admin/announcements', content, a.createAnnouncement);
router.put('/admin/announcements/:id', content, a.updateAnnouncement);
router.delete('/admin/announcements/:id', content, a.deleteAnnouncement);

const resource = need('resource:manage');
router.get('/admin/categories', resource, a.categories);
router.post('/admin/categories', resource, a.createCategory);
router.put('/admin/categories/:id', resource, a.updateCategory);
router.delete('/admin/categories/:id', resource, a.deleteCategory);
router.get('/admin/resources', resource, a.resources);
router.post('/admin/resources', resource, a.createResource);
router.put('/admin/resources/:id', resource, a.updateResource);
router.delete('/admin/resources/:id', resource, a.deleteResource);

module.exports = router;
