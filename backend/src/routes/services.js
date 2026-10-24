const { Router } = require('express');
const healthcare = require('../controllers/healthcare');
const employees = require('../controllers/employees');
const courses = require('../controllers/courses');
const checkout = require('../controllers/checkout');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = Router();

// Healthcare (demonstration): public info, private appointment requests.
router.get('/healthcare/info', healthcare.info);
router.post('/healthcare/appointments', requireAuth, healthcare.create);
router.get('/healthcare/appointments/mine', requireAuth, healthcare.mine);
router.delete('/healthcare/appointments/:id', requireAuth, healthcare.cancel);

// Employees: administrators only (enforced here, not in the UI).
const admin = [requireAuth, requireRole('ADMIN')];
router.get('/employees', admin, employees.list);
router.post('/employees', admin, employees.create);
router.get('/employees/:id', admin, employees.get);
router.put('/employees/:id', admin, employees.update);
router.delete('/employees/:id', admin, employees.remove);

// Course registration
router.get('/courses/catalog', courses.catalog);
router.get('/courses/registrations/mine', requireAuth, courses.mine);
router.post('/courses/registrations', requireAuth, courses.create);
router.delete('/courses/registrations/:id', requireAuth, courses.remove);

// Checkout demonstration (no real payment)
router.get('/checkout/catalog', checkout.catalog);
router.post('/checkout/demo', checkout.submit);

module.exports = router;
