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

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to create development accounts in production.'); process.exitCode = 1; return; }
  const password = `Dev${crypto.randomBytes(6).toString('hex')}9`;
  const passwordHash = await bcrypt.hash(password, 12);
  const lines = ['CampusSphere development accounts (local only, never commit this file)', `Password for all: ${password}`, ''];
  for (const role of ROLES) {
    const email = `${role.toLowerCase().replace(/_/g, '.')}@campussphere.test`;
    const name = role.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
    const user = await db.user.upsert({ where: { email }, update: { passwordHash, role, status: 'ACTIVE', name: `${name} (dev)` }, create: { email, passwordHash, role, name: `${name} (dev)` } });
    await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    lines.push(`${role.padEnd(18)} ${email}`);
  }
  const file = path.resolve(__dirname, '../dev-accounts.txt');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`Created ${ROLES.length} development accounts. Credentials are in ${file}`);
})().finally(() => db.$disconnect());
