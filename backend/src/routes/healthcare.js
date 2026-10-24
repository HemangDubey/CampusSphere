const { Router } = require('express');
const h = require('../controllers/healthcare');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();
router.get('/healthcare/info', h.info);
router.get('/healthcare/services', h.services);
router.get('/healthcare/providers/:id', h.provider);

router.post('/healthcare/appointments', requireAuth, h.create);
router.get('/healthcare/appointments/mine', requireAuth, h.mine);
router.get('/healthcare/appointments/:id', requireAuth, h.getOne);
router.post('/healthcare/appointments/:id/cancel', requireAuth, h.cancel);
router.post('/healthcare/appointments/:id/reschedule', requireAuth, h.reschedule);

const admin = [requireAuth, requirePermission('healthcare:manage')];
router.get('/manage/healthcare/appointments', admin, h.adminList);
router.get('/manage/healthcare/appointments/:id', admin, h.adminGet);
router.post('/manage/healthcare/appointments/:id/transition', admin, h.adminTransition);
router.get('/manage/healthcare/services', admin, h.adminServices);
router.post('/manage/healthcare/services', admin, h.createService);
router.put('/manage/healthcare/services/:id', admin, h.updateService);
router.delete('/manage/healthcare/services/:id', admin, h.deleteService);
router.post('/manage/healthcare/providers', admin, h.createProvider);
router.put('/manage/healthcare/providers/:id', admin, h.updateProvider);
router.delete('/manage/healthcare/providers/:id', admin, h.deleteProvider);
router.get('/manage/healthcare/providers/:id/slots', admin, h.providerSlots);
router.post('/manage/healthcare/providers/:id/slots', admin, h.generateSlots);
router.put('/manage/healthcare/slots/:id', admin, h.setSlotStatus);
router.delete('/manage/healthcare/slots/:id', admin, h.deleteSlot);

module.exports = router;
