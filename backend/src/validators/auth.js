// Server-side validation. Each function returns { value } or { errors: { field: message } }.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const PASSWORD_MESSAGE = 'Use 8 to 128 characters with at least one letter and one number.';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function email(v, errors) {
  const value = str(v).toLowerCase();
  if (!value || value.length > 254 || !EMAIL.test(value)) errors.email = 'Enter a valid email address.';
  return value;
}

function newPassword(body, errors) {
  const { password, confirmPassword } = body;
  if (typeof password !== 'string' || !PASSWORD.test(password)) errors.password = PASSWORD_MESSAGE;
  else if (confirmPassword !== undefined && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return password;
}

function result(errors, value) {
  return Object.keys(errors).length ? { errors } : { value };
}

function register(body = {}) {
  const errors = {};
  const name = str(body.name);
  if (name.length < 2 || name.length > 80) errors.name = 'Enter your full name (2 to 80 characters).';
  const mail = email(body.email, errors);
  const password = newPassword({ ...body, confirmPassword: body.confirmPassword ?? '' }, errors);
  return result(errors, { name, email: mail, password });
}

function login(body = {}) {
  const errors = {};
  const mail = email(body.email, errors);
  if (typeof body.password !== 'string' || !body.password || body.password.length > 128) errors.password = 'Enter your password.';
  return result(errors, { email: mail, password: body.password });
}

function forgotPassword(body = {}) {
  const errors = {};
  const mail = email(body.email, errors);
  return result(errors, { email: mail });
}

function resetPassword(body = {}) {
  const errors = {};
  if (typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 200) errors.token = 'Reset link is invalid.';
  const password = newPassword({ ...body, confirmPassword: body.confirmPassword ?? '' }, errors);
  return result(errors, { token: body.token, password });
}

function profile(body = {}) {
  const errors = {};
  const value = {};
  if (body.name !== undefined) {
    value.name = str(body.name);
    if (value.name.length < 2 || value.name.length > 80) errors.name = 'Enter your full name (2 to 80 characters).';
  }
  if (body.department !== undefined) {
    value.department = str(body.department) || null;
    if (value.department && value.department.length > 80) errors.department = 'Department must be 80 characters or fewer.';
  }
  if (body.yearOfStudy !== undefined && body.yearOfStudy !== null && body.yearOfStudy !== '') {
    const y = Number(body.yearOfStudy);
    if (!Number.isInteger(y) || y < 1 || y > 8) errors.yearOfStudy = 'Year of study must be between 1 and 8.';
    else value.yearOfStudy = y;
  } else if (body.yearOfStudy !== undefined) value.yearOfStudy = null;
  if (body.phone !== undefined) {
    value.phone = str(body.phone) || null;
    if (value.phone && !/^\+?[0-9 ()-]{7,20}$/.test(value.phone)) errors.phone = 'Enter a valid phone number.';
  }
  if (body.bio !== undefined) {
    value.bio = str(body.bio) || null;
    if (value.bio && value.bio.length > 300) errors.bio = 'Bio must be 300 characters or fewer.';
  }
  return result(errors, value);
}

module.exports = { register, login, forgotPassword, resetPassword, profile };
