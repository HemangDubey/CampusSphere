// Assign a staff role to an existing registered user. There is no default admin account or password.
//   npm run admin:promote -- someone@university.edu                      (SUPER_ADMIN)
//   npm run admin:promote -- someone@university.edu CAMPUS_ADMIN
// Roles: STUDENT, FACULTY, EVENT_ORGANIZER, HEALTHCARE_ADMIN, CAMPUS_ADMIN, SUPER_ADMIN.
// Run on a machine that has DATABASE_URL. The user must have registered normally first. Each change is audit-logged.
// Once a super administrator exists, roles can also be changed in the app (Administration > Users and roles).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const db = require('../src/db');
const { ROLES } = require('../src/permissions');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const role = String(process.argv[3] || 'SUPER_ADMIN').trim().toUpperCase();
  if (!email || !ROLES.includes(role)) {
    console.error(`Usage: npm run admin:promote -- user@example.edu [${ROLES.join('|')}]`);
    process.exitCode = 1;
    return;
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) { console.error('No registered user with that email. Register the account first.'); process.exitCode = 1; return; }
  await db.user.update({ where: { id: user.id }, data: { role } });
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.auditLog.create({ data: { action: 'user.role', entityType: 'User', entityId: user.id, summary: `Provisioning script set ${email} to ${role} (was ${user.role})` } });
  console.log(`${email} is now ${role}. They must sign in again.`);
})().finally(() => db.$disconnect());
