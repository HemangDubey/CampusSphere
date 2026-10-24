// Promote an existing registered user to ADMIN. There is no default admin account or password.
//   npm run admin:promote -- someone@university.edu
// Run on the server/host that has DATABASE_URL; the user must already have registered normally.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const db = require('../src/db');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) { console.error('Usage: npm run admin:promote -- user@example.edu'); process.exitCode = 1; return; }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) { console.error('No registered user with that email. Register the account first.'); process.exitCode = 1; return; }
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.log(`${email} is now an administrator.`);
})().finally(() => db.$disconnect());
