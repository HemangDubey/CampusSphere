// LOCAL DEVELOPMENT ONLY: creates one account per role so every role can be tried without registering by hand.
//   npm run dev:accounts
// Refuses to run when NODE_ENV=production. A random password is generated, stored only as a bcrypt hash in the
// database, and written to backend/dev-accounts.txt (git-ignored). Re-running resets the password and role of the same emails.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const db = require('../src/db');
const { ROLES } = require('../src/permissions');

async function run() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to create development accounts in production.');
  const password = `Dev${crypto.randomBytes(6).toString('hex')}9`;
  const passwordHash = await bcrypt.hash(password, 12);
  const lines = ['CampusSphere development accounts (local only, never commit this file)', `Password for all: ${password}`, ''];
  for (const role of ROLES) {
    const email = `${role.toLowerCase().replace(/_/g, '.')}@campussphere.test`;
    const name = { STUDENT: 'Student User', FACULTY: 'Faculty Member', EVENT_ORGANIZER: 'Event Organizer', HEALTHCARE_ADMIN: 'Healthcare Admin', CAMPUS_ADMIN: 'Campus Admin', SUPER_ADMIN: 'Super Admin' }[role];
    const user = await db.user.upsert({ where: { email }, update: { passwordHash, role, status: 'ACTIVE', name }, create: { email, passwordHash, role, name } });
    await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    lines.push(`${role.padEnd(18)} ${email}`);
  }
  const file = path.resolve(__dirname, '../dev-accounts.txt');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`Created ${ROLES.length} development accounts. Credentials are in ${file}`);
}

module.exports = { run };
if (require.main === module) run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
