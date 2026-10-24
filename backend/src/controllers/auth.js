const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const v = require('../validators/auth');
const { ok, HttpError } = require('../utils/response');
const { startSession, clearSessionCookie } = require('../middleware/auth');

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so login timing does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function publicUser(u) {
  const { id, name, email, role, department, yearOfStudy, phone, bio, createdAt } = u;
  return { id, name, email, role, department, yearOfStudy, phone, bio, createdAt };
}

function validated(result) {
  if (result.errors) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', result.errors);
  return result.value;
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = validated(v.register(req.body));
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
    await startSession(res, user.id);
    ok(res, { user: publicUser(user) }, { status: 201, message: 'Account created.' });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = validated(v.login(req.body));
    const user = await db.user.findUnique({ where: { email } });
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !match) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
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
