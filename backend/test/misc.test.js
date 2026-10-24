// Employees (administrators only), course registration and the checkout demonstration.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const U = '11111111-1111-4111-8111-111111111111';

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' });
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const admin = await signUp(server, db, PREFIX, 'admin', 'CAMPUS_ADMIN');
    const health = await signUp(server, db, PREFIX, 'health', 'HEALTHCARE_ADMIN');

    // ---- Employees: only campus and super administrators
    assert.equal((await anon.get('/api/employees')).status, 401);
    for (const who of [a, health]) {
      assert.equal((await who.api.get('/api/employees')).status, 403);
      assert.equal((await who.api.post('/api/employees', {})).status, 403);
      assert.equal((await who.api.del(`/api/employees/${U}`)).status, 403);
    }
    let r = await admin.api.get('/api/employees');
    assert.ok(r.body.data.total >= 3);
    assert.equal((await admin.api.get('/api/employees?q=librarian')).body.data.employees.length, 1);
    r = await admin.api.post('/api/employees', { employeeId: 'bad', name: 'x', designation: '', department: '', email: 'nope', phone: '12', joinedOn: '2999-01-01' });
    assert.equal(r.status, 400);
    ['employeeId', 'name', 'designation', 'department', 'email', 'phone', 'joinedOn'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    const emp = { employeeId: 'TST-9001', name: 'Test Employee', designation: 'Tester', department: 'QA', email: `${PREFIX}-emp@example.test`, phone: '9123456789', joinedOn: '2023-01-15' };
    r = await admin.api.post('/api/employees', emp);
    assert.equal(r.status, 201);
    const id = r.body.data.employee.id;
    assert.equal((await admin.api.post('/api/employees', emp)).status, 409);
    assert.ok((await admin.api.post('/api/employees', { ...emp, employeeId: 'TST-9002' })).body.error.details.email);
    assert.equal((await admin.api.get(`/api/employees/${id}`)).body.data.employee.name, 'Test Employee');
    assert.equal((await admin.api.put(`/api/employees/${id}`, { ...emp, designation: 'Senior Tester' })).body.data.employee.designation, 'Senior Tester');
    assert.equal((await admin.api.put(`/api/employees/${id}`, {})).status, 400);
    assert.equal((await admin.api.get('/api/employees/not-a-uuid')).status, 400);
    assert.equal((await admin.api.del(`/api/employees/${id}`)).status, 200);
    assert.equal((await admin.api.del(`/api/employees/${id}`)).status, 404);

    // ---- Course registration
    assert.equal((await anon.post('/api/courses/registrations', {})).status, 401);
    const cat = (await anon.get('/api/courses/catalog')).body.data;
    assert.equal((await a.api.post('/api/courses/registrations', { courseCode: 'XXX', semester: 'FALL' })).status, 400);
    const reg = { courseCode: 'CSE201', semester: 'ODD', academicYear: cat.academicYears[1], notes: 'First choice', consent: true };
    r = await a.api.post('/api/courses/registrations', reg);
    assert.equal(r.status, 201);
    assert.equal((await a.api.post('/api/courses/registrations', reg)).status, 409);
    assert.equal((await b.api.post('/api/courses/registrations', reg)).status, 201);
    assert.equal((await b.api.del(`/api/courses/registrations/${r.body.data.registration.id}`)).status, 404, "cannot remove another student's registration");
    assert.equal((await a.api.del(`/api/courses/registrations/${r.body.data.registration.id}`)).status, 200);

    // ---- Checkout demonstration
    const form = { name: 'Test Buyer', email: 'buyer@example.test', phone: '9876543210', address: '12 Sample Street', city: 'Vellore', pincode: '632014', method: 'upi', outcome: 'approve', consent: true,
      items: [{ id: 'symposium-pass', quantity: 2 }, { id: 'workshop-kit', quantity: 1 }] };
    r = await anon.post('/api/checkout/demo', form);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.summary.subtotal, r.body.data.summary.tax, r.body.data.summary.fee, r.body.data.summary.total], [1300, 234, 20, 1554]);
    assert.match(r.body.message, /No payment was made/);
    assert.equal(/transaction|txn|receipt|paymentId|orderId/i.test(JSON.stringify(r.body)), false, 'no fake transaction ids');
    assert.equal((await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'symposium-pass', quantity: 1, price: 1 }], total: 1 })).body.data.summary.subtotal, 500, 'client prices are ignored');
    assert.equal((await anon.post('/api/checkout/demo', { ...form, outcome: 'decline' })).status, 402);
    assert.equal((await anon.post('/api/checkout/demo', { ...form, outcome: 'cancel' })).body.data.result, 'DEMO_CANCELLED');
    assert.equal((await anon.post('/api/checkout/demo', { ...form, cardNumber: '4111111111111111', cvv: '123' })).body.error.code, 'SENSITIVE_DATA_REJECTED');
    r = await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'nope', quantity: 1 }], pincode: '123', method: 'bitcoin', consent: false });
    ['items', 'pincode', 'method', 'consent'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'workshop-kit', quantity: 99 }] })).status, 400);
    assert.equal((await anon.post('/api/checkout/demo', { ...form, items: [] })).status, 400);
    console.log('Misc tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
