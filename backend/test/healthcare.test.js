// Healthcare: directory, slot booking with double-booking prevention, reschedule, cancel, administrator review.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const U = '11111111-1111-4111-8111-111111111111';
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' });
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  const made = { services: [] };
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const hadmin = await signUp(server, db, PREFIX, 'hadmin', 'HEALTHCARE_ADMIN');
    const cadmin = await signUp(server, db, PREFIX, 'cadmin', 'CAMPUS_ADMIN');
    const sadmin = await signUp(server, db, PREFIX, 'sadmin', 'SUPER_ADMIN');

    // ---- Directory
    let r = await anon.get('/api/healthcare/services');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.services.length >= 5 && r.body.data.notice.includes('not a medical'));
    const gen = r.body.data.services.find((s) => s.name === 'General consultation');
    assert.ok(gen.providers.length >= 2 && gen.providers[0].openSlots > 0);
    assert.ok((await anon.get('/api/healthcare/services?q=dental')).body.data.services.length >= 1);
    assert.equal((await anon.get('/api/healthcare/services?q=zzzz')).body.data.services.length, 0);
    assert.ok((await anon.get('/api/healthcare/services?category=Dental')).body.data.services.every((s) => s.category === 'Dental'));
    const prov = gen.providers[0];
    r = await anon.get(`/api/healthcare/providers/${prov.id}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.data.slots.length > 5 && r.body.data.slots.every((s) => s.status === 'OPEN' && new Date(s.startsAt) > new Date()));
    assert.equal((await anon.get(`/api/healthcare/providers/${U}`)).status, 404);
    const [s1, s2, s3] = r.body.data.slots;

    // ---- Request validation
    const form = (o = {}) => ({ serviceId: gen.id, providerId: prov.id, slotId: s1.id, patientName: 'Tester A', phone: '98765 43210', reason: 'Routine check-up', consent: true, confirm: true, ...o });
    assert.equal((await anon.post('/api/healthcare/appointments', form())).status, 401);
    r = await a.api.post('/api/healthcare/appointments', { confirm: false });
    assert.equal(r.status, 400);
    ['patientName', 'phone', 'reason', 'consent', 'serviceId', 'confirm'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await a.api.post('/api/healthcare/appointments', form({ phone: '12345' }))).status, 400);
    assert.equal((await a.api.post('/api/healthcare/appointments', form({ serviceId: U }))).status, 404);
    assert.ok((await a.api.post('/api/healthcare/appointments', form({ providerId: U }))).body.error.details.providerId);
    assert.ok((await a.api.post('/api/healthcare/appointments', form({ slotId: undefined }))).body.error.details.slotId, 'a slot is required when the provider has availability');
    assert.ok((await a.api.post('/api/healthcare/appointments', form({ slotId: U }))).body.error.details.slotId);
    const other = gen.providers[1];
    const otherSlot = (await anon.get(`/api/healthcare/providers/${other.id}`)).body.data.slots[0];
    assert.ok((await a.api.post('/api/healthcare/appointments', form({ slotId: otherSlot.id }))).body.error.details.slotId, "a slot of another provider is rejected");
    const dental = r2(await anon.get('/api/healthcare/services?q=dental')).services[0];
    assert.equal((await a.api.post('/api/healthcare/appointments', form({ serviceId: dental.id }))).status, 400, 'provider must belong to the service');

    // ---- Book a slot
    r = await a.api.post('/api/healthcare/appointments', form());
    assert.equal(r.status, 201);
    assert.match(r.body.message, /not a confirmed clinic appointment/);
    const appt = r.body.data.appointment;
    assert.match(appt.referenceNo, /^APT-\d{4}-[A-Z0-9]{6}$/);
    assert.equal(appt.status, 'REQUESTED');
    assert.equal(appt.slot.id, s1.id);
    assert.equal((await db.healthSlot.findUnique({ where: { id: s1.id } })).status, 'BOOKED');
    assert.equal(JSON.stringify(r.body).includes('9876543210'), false, 'phone is not echoed');

    // double booking
    r = await b.api.post('/api/healthcare/appointments', form());
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'SLOT_UNAVAILABLE');
    assert.equal(await db.appointment.count({ where: { slotId: s1.id } }), 1);
    assert.ok(!(await anon.get(`/api/healthcare/providers/${prov.id}`)).body.data.slots.some((s) => s.id === s1.id), 'booked slots disappear from availability');
    // concurrent requests for the same slot: exactly one wins
    const race = await Promise.all([a.api.post('/api/healthcare/appointments', form({ slotId: s2.id })), b.api.post('/api/healthcare/appointments', form({ slotId: s2.id }))]);
    assert.deepEqual(race.map((x) => x.status).sort(), [201, 409]);
    assert.equal(await db.appointment.count({ where: { slotId: s2.id } }), 1);

    // ---- Privacy
    assert.equal((await a.api.get('/api/healthcare/appointments/mine')).body.data.appointments.length, 2 - (race[0].status === 201 ? 0 : 1) + (race[0].status === 201 ? 0 : 0) || 2);
    const mineB = (await b.api.get('/api/healthcare/appointments/mine')).body.data.appointments;
    const mineA = (await a.api.get('/api/healthcare/appointments/mine')).body.data.appointments;
    assert.equal(mineA.length + mineB.length, 2, 'two appointments exist in total');
    assert.equal((await b.api.get(`/api/healthcare/appointments/${appt.id}`)).status, 404, "cannot read another user's appointment");
    assert.equal((await b.api.post(`/api/healthcare/appointments/${appt.id}/cancel`)).status, 404);
    assert.equal((await b.api.post(`/api/healthcare/appointments/${appt.id}/reschedule`, { slotId: s3.id, reason: 'need to move' })).status, 404);
    assert.equal((await a.api.get('/api/manage/healthcare/appointments')).status, 403, 'students cannot use the admin queue');
    assert.equal((await cadmin.api.get('/api/manage/healthcare/appointments')).status, 403, 'campus admins have no healthcare access');
    assert.equal((await anon.get('/api/manage/healthcare/appointments')).status, 401);

    // ---- Reschedule request, cancel
    assert.equal((await a.api.post(`/api/healthcare/appointments/${appt.id}/reschedule`, { slotId: s3.id, reason: 'x' })).status, 400, 'reason required');
    assert.equal((await a.api.post(`/api/healthcare/appointments/${appt.id}/reschedule`, { slotId: s1.id, reason: 'same slot please' })).status, 400);
    r = await a.api.post(`/api/healthcare/appointments/${appt.id}/reschedule`, { slotId: s3.id, reason: 'Clash with an exam' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.appointment.status, 'RESCHEDULE_REQUESTED');
    assert.equal(r.body.data.appointment.slot.id, s3.id);
    assert.equal((await db.healthSlot.findUnique({ where: { id: s1.id } })).status, 'OPEN', 'old slot is released');
    assert.equal((await db.healthSlot.findUnique({ where: { id: s3.id } })).status, 'BOOKED');
    assert.equal((await b.api.post('/api/healthcare/appointments', form({ slotId: s1.id }))).status, 201, 'someone else can now take the old slot');

    // ---- Administrator workflow
    r = await hadmin.api.get('/api/manage/healthcare/appointments?status=RESCHEDULE_REQUESTED');
    assert.ok(r.body.data.appointments.some((x) => x.id === appt.id) && r.body.data.counts.RESCHEDULE_REQUESTED >= 1);
    assert.ok((await hadmin.api.get(`/api/manage/healthcare/appointments?q=${appt.referenceNo}`)).body.data.appointments.length === 1);
    const tr = (id, to, note) => hadmin.api.post(`/api/manage/healthcare/appointments/${id}/transition`, { to, note });
    assert.equal((await a.api.post(`/api/manage/healthcare/appointments/${appt.id}/transition`, { to: 'CONFIRMED' })).status, 403, 'students cannot confirm');
    assert.equal((await tr(appt.id, 'COMPLETED')).status, 409, 'cannot complete before confirming');
    assert.equal((await tr(appt.id, 'NOPE')).status, 409);
    assert.equal((await tr(appt.id, 'REJECTED', 'no')).status, 400, 'reason required');
    assert.equal((await tr(appt.id, 'CONFIRMED', 'See you then')).status, 200);
    assert.ok(await db.notification.findFirst({ where: { userId: a.id, title: { contains: 'confirmed' } } }));
    assert.equal((await tr(appt.id, 'CONFIRMED')).status, 409, 'already confirmed');
    r = await hadmin.api.get(`/api/manage/healthcare/appointments/${appt.id}`);
    assert.deepEqual(r.body.data.history.map((h) => h.toStatus), ['REQUESTED', 'RESCHEDULE_REQUESTED', 'CONFIRMED']);
    assert.equal((await tr(appt.id, 'COMPLETED', 'Attended')).status, 200);
    assert.equal((await tr(appt.id, 'CANCELLED', 'too late now')).status, 409, 'completed is final');
    assert.equal((await a.api.post(`/api/healthcare/appointments/${appt.id}/cancel`)).status, 409);

    // cancel by the patient frees the slot; admin rejection frees it too
    const bAppt = (await b.api.get('/api/healthcare/appointments/mine')).body.data.appointments.find((x) => x.slot?.id === s1.id);
    assert.equal((await b.api.post(`/api/healthcare/appointments/${bAppt.id}/cancel`, { reason: 'Feeling better' })).body.data.appointment.status, 'CANCELLED');
    assert.equal((await db.healthSlot.findUnique({ where: { id: s1.id } })).status, 'OPEN');
    const again = (await a.api.post('/api/healthcare/appointments', form({ slotId: s1.id }))).body.data.appointment;
    assert.equal((await tr(again.id, 'REJECTED', 'Provider is unavailable that day.')).status, 200);
    assert.equal((await db.healthSlot.findUnique({ where: { id: s1.id } })).status, 'OPEN', 'rejection releases the slot');
    assert.ok((await db.statusHistory.findMany({ where: { subjectId: again.id } })).some((h) => h.note === 'Provider is unavailable that day.'));
    assert.ok((await db.auditLog.findMany({ where: { entityId: again.id } })).some((l) => l.action === 'appointment.rejected'));

    // ---- Service, provider and slot management
    assert.equal((await a.api.post('/api/manage/healthcare/services', { name: 'x' })).status, 403);
    r = await hadmin.api.post('/api/manage/healthcare/services', { name: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.category && r.body.error.details.description);
    r = await hadmin.api.post('/api/manage/healthcare/services', { name: `${PREFIX} Testing clinic`, category: 'Testing', description: 'A clinic used by the automated tests.' });
    assert.equal(r.status, 201);
    const svc = r.body.data.service;
    made.services.push(svc.id);
    assert.equal((await hadmin.api.put(`/api/manage/healthcare/services/${svc.id}`, { name: `${PREFIX} Testing clinic`, category: 'Testing', description: 'A clinic used by the automated tests.', published: false })).body.data.service.published, false);
    assert.equal((await anon.get('/api/healthcare/services')).body.data.services.some((s) => s.id === svc.id), false, 'unpublished services are hidden');
    assert.equal((await a.api.post('/api/healthcare/appointments', { serviceId: svc.id, patientName: 'Tester A', phone: '9876543210', reason: 'Just testing', consent: true, confirm: true })).status, 404);
    await hadmin.api.put(`/api/manage/healthcare/services/${svc.id}`, { name: `${PREFIX} Testing clinic`, category: 'Testing', description: 'A clinic used by the automated tests.', published: true });
    assert.equal((await hadmin.api.post('/api/manage/healthcare/providers', { serviceId: svc.id, name: 'x' })).status, 400);
    r = await hadmin.api.post('/api/manage/healthcare/providers', { serviceId: svc.id, name: 'Dr. Test Provider', speciality: 'Testing' });
    const tp = r.body.data.provider;
    assert.equal(r.status, 201);
    // slot generation
    const slotBody = (o = {}) => ({ date: iso(2), startTime: '09:00', endTime: '10:00', slotMinutes: 30, ...o });
    assert.ok((await hadmin.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody({ endTime: '08:00' }))).body.error.details.endTime);
    assert.ok((await hadmin.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody({ date: iso(-2) }))).body.error.details.date);
    assert.ok((await hadmin.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody({ slotMinutes: 5 }))).body.error.details.slotMinutes);
    assert.equal((await a.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody())).status, 403);
    r = await hadmin.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody());
    assert.equal(r.body.data.created, 2);
    assert.equal((await hadmin.api.post(`/api/manage/healthcare/providers/${tp.id}/slots`, slotBody())).body.data.created, 0, 'no duplicate slots');
    const slots = (await hadmin.api.get(`/api/manage/healthcare/providers/${tp.id}/slots`)).body.data.slots;
    assert.equal(slots.length, 2);
    assert.equal((await hadmin.api.put(`/api/manage/healthcare/slots/${slots[0].id}`, { status: 'BLOCKED' })).body.data.slot.status, 'BLOCKED');
    assert.equal((await anon.get(`/api/healthcare/providers/${tp.id}`)).body.data.slots.length, 1, 'blocked slots are hidden');
    assert.equal((await hadmin.api.put(`/api/manage/healthcare/slots/${slots[0].id}`, { status: 'WHATEVER' })).status, 400);
    assert.equal((await a.api.post('/api/healthcare/appointments', { serviceId: svc.id, providerId: tp.id, slotId: slots[0].id, patientName: 'Tester A', phone: '9876543210', reason: 'Blocked slot', consent: true, confirm: true })).status, 409, 'blocked slots cannot be booked');
    const booked = (await a.api.post('/api/healthcare/appointments', { serviceId: svc.id, providerId: tp.id, slotId: slots[1].id, patientName: 'Tester A', phone: '9876543210', reason: 'Booked slot', consent: true, confirm: true })).body.data.appointment;
    assert.equal((await hadmin.api.put(`/api/manage/healthcare/slots/${slots[1].id}`, { status: 'OPEN' })).status, 409, 'booked slots cannot be changed');
    assert.equal((await hadmin.api.del(`/api/manage/healthcare/slots/${slots[1].id}`)).status, 409);
    assert.equal((await hadmin.api.del(`/api/manage/healthcare/slots/${slots[0].id}`)).status, 200);
    assert.equal((await hadmin.api.del(`/api/manage/healthcare/providers/${tp.id}`)).status, 409, 'provider with active appointments');
    assert.equal((await hadmin.api.del(`/api/manage/healthcare/services/${svc.id}`)).status, 409, 'service with history');
    await hadmin.api.post(`/api/manage/healthcare/appointments/${booked.id}/transition`, { to: 'CANCELLED', note: 'Test cleanup' });
    assert.equal((await sadmin.api.get('/api/manage/healthcare/services')).status, 200, 'super admins also manage healthcare');
    console.log('Healthcare tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.appointment.deleteMany({ where: { service: { name: { startsWith: PREFIX } } } });
    await db.healthService.deleteMany({ where: { id: { in: made.services } } });
    // Free the seeded slots this run booked, so repeated runs do not use up the shared availability.
    const mine = await db.appointment.findMany({ where: { user: { email: { startsWith: PREFIX } }, slotId: { not: null } }, select: { slotId: true } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    if (mine.length) await db.healthSlot.updateMany({ where: { id: { in: mine.map((m) => m.slotId) }, appointment: null }, data: { status: 'OPEN' } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();

function r2(res) { return res.body.data; }
