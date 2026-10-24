// Small helpers for validating list-endpoint query strings.
const { HttpError } = require('./response');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pageParams(query, { defaultSize = 12, maxSize = 50 } = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const size = query.pageSize === undefined ? defaultSize : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) throw new HttpError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  if (!Number.isInteger(size) || size < 1 || size > maxSize) throw new HttpError(400, 'VALIDATION_ERROR', `pageSize must be between 1 and ${maxSize}.`);
  return { page, size, skip: (page - 1) * size, take: size };
}

function oneOf(value, allowed, name) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new HttpError(400, 'VALIDATION_ERROR', `Invalid ${name}.`);
  return value;
}

function text(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid id.');
  return value;
}

module.exports = { pageParams, oneOf, text, uuid };
