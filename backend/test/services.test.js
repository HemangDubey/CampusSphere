// Healthcare, employees (admin-only), course registration, symposium form and checkout demo.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const PW = 'Sup3rSecret1';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function signUp(server, n) {
  const api = client(server);
  const r = await api.post('/api/auth/register', { name: `Tester ${n}`, email: `${PREFIX}-${n}@example.test`, password: PW, confirmPassword: PW });
  assert.equal(r.status, 201);
  return { api, id: r.body.data.user.id };
}

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' });
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  try {
    const a = await signUp(server, 'a');
    const b = await signUp(server, 'b');
    const admin = await signUp(server, 'admin');
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const adminApi = client(server);
    assert.equal((await adminApi.post('/api/auth/login', { email: `${PREFIX}-admin@example.test`, password: PW })).status, 200);

    // ---- Healthcare
    let r = await anon.get('/api/healthcare/info');
    assert.equal(r.body.data.demo, true);
    assert.match(r.body.data.disclaimer, /not a medical/i);
    assert.equal((await anon.post('/api/healthcare/appointments', {})).status, 401);
    r = await a.api.post('/api/healthcare/appointments', { patientName: 'A', phone: '123', department: 'Nope', preferredDate: day(-2), timePreference: 'NIGHT', reason: 'hi' });
    assert.equal(r.status, 400);
    ['patientName', 'phone', 'department', 'preferredDate', 'timePreference', 'reason', 'consent'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await a.api.post('/api/healthcare/appointments', 'garbage')).status, 400);
    const good = { patientName: 'Tester A', phone: '98765 43210', department: 'Dental', preferredDate: day(5), timePreference: 'MORNING', reason: 'Routine dental check', consent: true };
    r = await a.api.post('/api/healthcare/appointments', good);
    assert.equal(r.status, 201);
    assert.match(r.body.message, /No real appointment/);
    assert.equal(r.body.data.appointment.status, 'REQUESTED');
    assert.equal(JSON.stringify(r.body).includes('9876543210'), false, 'phone not echoed');
    const apptId = r.body.data.appointment.id;
    assert.equal((await a.api.post('/api/healthcare/appointments', { ...good, preferredDate: day(120) })).status, 400);
    assert.equal((await a.api.get('/api/healthcare/appointments/mine')).body.data.appointments.length, 1);
    assert.equal((await b.api.get('/api/healthcare/appointments/mine')).body.data.appointments.length, 0, 'private records');
    assert.equal((await b.api.raw('DELETE', `/api/healthcare/appointments/${apptId}`)).status, 404);
    assert.equal((await a.api.raw('DELETE', `/api/healthcare/appointments/${apptId}`)).status, 200);
    assert.equal((await a.api.get('/api/healthcare/appointments/mine')).body.data.appointments[0].status, 'CANCELLED');

    // ---- Employees: admin only
    assert.equal((await anon.get('/api/employees')).status, 401);
    assert.equal((await a.api.get('/api/employees')).status, 403);
    assert.equal((await a.api.post('/api/employees', {})).status, 403);
    assert.equal((await a.api.raw('DELETE', '/api/employees/11111111-1111-4111-8111-111111111111')).status, 403);
    r = await adminApi.get('/api/employees');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.total >= 3);
    assert.equal((await adminApi.get('/api/employees?q=librarian')).body.data.employees.length, 1);
    r = await adminApi.post('/api/employees', { employeeId: 'bad', name: 'x', designation: '', department: '', email: 'nope', phone: '12', joinedOn: day(3) });
    assert.equal(r.status, 400);
    ['employeeId', 'name', 'designation', 'department', 'email', 'phone', 'joinedOn'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    const emp = { employeeId: 'TST-9001', name: 'Test Employee', designation: 'Tester', department: 'QA', email: `${PREFIX}-emp@example.test`, phone: '9123456789', joinedOn: '2023-01-15' };
    r = await adminApi.post('/api/employees', emp);
    assert.equal(r.status, 201);
    const empId = r.body.data.employee.id;
    assert.equal((await adminApi.post('/api/employees', emp)).status, 409);
    assert.equal((await adminApi.post('/api/employees', { ...emp, employeeId: 'TST-9002' })).body.error.details.email.length > 0, true);
    assert.equal((await adminApi.get(`/api/employees/${empId}`)).body.data.employee.name, 'Test Employee');
    assert.equal((await adminApi.raw('PUT', `/api/employees/${empId}`)).status, 400);
    assert.equal((await adminApi.get('/api/employees/not-a-uuid')).status, 400);

    // ---- Course registration
    assert.equal((await anon.post('/api/courses/registrations', {})).status, 401);
    const cat = (await anon.get('/api/courses/catalog')).body.data;
    assert.equal(cat.demo, true);
    r = await a.api.post('/api/courses/registrations', { courseCode: 'XXX', semester: 'FALL' });
    assert.equal(r.status, 400);
    const reg = { courseCode: 'CSE201', semester: 'ODD', academicYear: cat.academicYears[1], notes: 'First choice', consent: true };
    r = await a.api.post('/api/courses/registrations', reg);
    assert.equal(r.status, 201);
    assert.equal((await a.api.post('/api/courses/registrations', reg)).status, 409);
    assert.equal((await b.api.post('/api/courses/registrations', reg)).status, 201, 'another user may register for the same course');
    assert.equal((await a.api.get('/api/courses/registrations/mine')).body.data.registrations.length, 1);
    assert.equal((await b.api.raw('DELETE', `/api/courses/registrations/${r.body.data.registration.id}`)).status, 404, "B cannot remove A's registration");
    assert.equal((await a.api.get('/api/courses/registrations/mine')).body.data.registrations.length, 1);
    assert.equal((await a.api.raw('DELETE', `/api/courses/registrations/${(await a.api.get('/api/courses/registrations/mine')).body.data.registrations[0].id}`)).status, 200);

    // ---- Symposium registration needs extra fields
    const symp = await db.event.findFirst({ where: { category: 'SYMPOSIUM', isDemo: true, startsAt: { gt: new Date() } } });
    r = await a.api.post(`/api/events/${symp.id}/register`, {});
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.teamSize && r.body.error.details.track && r.body.error.details.consent);
    assert.equal((await a.api.post(`/api/events/${symp.id}/register`, { teamSize: 9, track: 'Quiz', consent: true })).status, 400);
    r = await a.api.post(`/api/events/${symp.id}/register`, { teamSize: 2, track: 'Quiz', consent: true });
    assert.equal(r.status, 201);
    const stored = await db.eventRegistration.findFirst({ where: { userId: a.id, eventId: symp.id } });
    assert.deepEqual([stored.teamSize, stored.track], [2, 'Quiz']);

    // ---- Checkout demo
    const form = { name: 'Test Buyer', email: 'buyer@example.test', phone: '9876543210', address: '12 Sample Street', city: 'Vellore', pincode: '632014', method: 'upi', outcome: 'approve', consent: true,
      items: [{ id: 'symposium-pass', quantity: 2 }, { id: 'workshop-kit', quantity: 1 }] };
    r = await anon.post('/api/checkout/demo', form);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.data.summary.subtotal, r.body.data.summary.tax, r.body.data.summary.fee, r.body.data.summary.total], [1300, 234, 20, 1554]);
    assert.equal(r.body.data.demo, true);
    assert.match(r.body.message, /No payment was made/);
    assert.equal(/transaction|txn|receipt|paymentId|orderId/i.test(JSON.stringify(r.body)), false, 'no fake transaction ids');
    r = await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'symposium-pass', quantity: 1, price: 1 }], total: 1 });
    assert.equal(r.body.data.summary.subtotal, 500, 'client-sent prices are ignored');
    assert.equal((await anon.post('/api/checkout/demo', { ...form, outcome: 'decline' })).status, 402);
    r = await anon.post('/api/checkout/demo', { ...form, outcome: 'cancel' });
    assert.equal(r.body.data.result, 'DEMO_CANCELLED');
    assert.equal((await anon.post('/api/checkout/demo', { ...form, cardNumber: '4111111111111111', cvv: '123' })).body.error.code, 'SENSITIVE_DATA_REJECTED');
    r = await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'nope', quantity: 1 }], pincode: '123', method: 'bitcoin', consent: false });
    assert.equal(r.status, 400);
    ['items', 'pincode', 'method', 'consent'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await anon.post('/api/checkout/demo', { ...form, items: [{ id: 'workshop-kit', quantity: 99 }] })).status, 400);
    assert.equal((await anon.post('/api/checkout/demo', { ...form, items: [] })).status, 400);
    console.log('Services tests passed');
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
