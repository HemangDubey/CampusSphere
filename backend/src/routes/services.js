const { Router } = require('express');
const employees = require('../controllers/employees');
const courses = require('../controllers/courses');
const checkout = require('../controllers/checkout');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = Router();

// Employees: campus and super administrators only (enforced here, not in the UI).
const admin = [requireAuth, requirePermission('employee:manage')];
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
