const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const v = require('../validators/auth');
const { ok, HttpError } = require('../utils/response');
const { startSession, clearSessionCookie } = require('../middleware/auth');
const { permissionsFor } = require('../permissions');

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so login timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const REQUESTABLE_ROLES = ['FACULTY', 'EVENT_ORGANIZER', 'HEALTHCARE_ADMIN', 'CAMPUS_ADMIN'];
const { notifyMany } = require('../services/notify');

function publicUser(u) {
  const { id, name, email, role, department, yearOfStudy, phone, bio, registrationNo, createdAt } = u;
  return { id, name, email, role, department, yearOfStudy, phone, bio, registrationNo, createdAt, permissions: permissionsFor(role) };
}

function validated(result) {
  if (result.errors) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.errors);
  return result.value;
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = validated(v.register(req.body));
    // Only a request is recorded; the role itself is never taken from the client.
    const wanted = req.body?.requestedRole;
    if (wanted !== undefined && wanted !== '' && wanted !== 'STUDENT' && !REQUESTABLE_ROLES.includes(wanted)) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { requestedRole: 'Choose one of the listed roles.' });
    const requestedRole = REQUESTABLE_ROLES.includes(wanted) ? wanted : null;
    if (await db.user.findUnique({ where: { email } })) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in.', { email: 'This email is already registered.' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    let user;
    try { user = await db.user.create({ data: { name, email, passwordHash } }); }
    catch (e) {
      if (e.code === 'P2002') throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in.', { email: 'This email is already registered.' });
      throw e;
    }
    if (requestedRole) {
      await db.roleRequest.create({ data: { userId: user.id, requestedRole } });
      const approvers = await db.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } });
      await notifyMany(approvers.map((a) => a.id), { type: 'SYSTEM', title: `Role request from ${user.name}`, body: `Requested ${requestedRole.replace('_', ' ').toLowerCase()} access`, link: '/admin/users' });
    }
    await startSession(res, user.id);
    ok(res, { user: publicUser(user), roleRequest: requestedRole ? { requestedRole, status: 'PENDING' } : null }, { status: 201, message: requestedRole ? 'Account created as a student. Your role request is waiting for approval.' : 'Account created.' });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = validated(v.login(req.body));
    const user = await db.user.findUnique({ where: { email } });
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !match) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact an administrator.');
    await startSession(res, user.id);
    ok(res, { user: publicUser(user) });
  } catch (e) { next(e); }
};

exports.logout = async (req, res, next) => {
  try {
    await db.session.update({ where: { id: req.session.id }, data: { revokedAt: new Date() } });
    clearSessionCookie(res);
    ok(res, null, { message: 'Signed out.' });
  } catch (e) { next(e); }
};

exports.me = (req, res) => ok(res, { user: publicUser(req.user) });

exports.updateProfile = async (req, res, next) => {
  try {
    const data = validated(v.profile(req.body));
    const user = await db.user.update({ where: { id: req.user.id }, data });
    ok(res, { user: publicUser(user) }, { message: 'Profile updated.' });
  } catch (e) { next(e); }
};

const GENERIC_RESET = 'If an account exists for that email, a reset link has been prepared.';

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = validated(v.forgotPassword(req.body));
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + config.resetTokenMinutes * 60 * 1000) }
      });
      // No mail provider is configured, so no email is sent. In development the link is printed to the
      // server console so the flow can be tested; in production nothing is revealed anywhere.
      if (!config.isProduction) console.log(`[dev only] password reset link: http://localhost:${config.port}/reset-password?token=${token}`);
    }
    ok(res, { delivery: 'not-configured' }, { message: GENERIC_RESET });
  } catch (e) { next(e); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = validated(v.resetPassword(req.body));
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired. Request a new one.');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
    ok(res, null, { message: 'Password updated. Please sign in.' });
  } catch (e) { next(e); }
};
