// Checks the browser and server validation rules agree on the same cases.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const server = require('../src/validators/rules');

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const browser = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/js/validators.js')).href);
  const cases = [
    ['required', [], '', 'bad'], ['required', [], '  ', 'bad'], ['required', [], 'x', 'ok'],
    ['email', [], 'a@b.co', 'ok'], ['email', [], 'a@b', 'bad'], ['email', [], 'a b@c.co', 'bad'], ['email', [], '', 'ok'],
    ['phoneIN', [], '9876543210', 'ok'], ['phoneIN', [], '+91 98765-43210', 'ok'], ['phoneIN', [], '1234567890', 'bad'], ['phoneIN', [], '98765', 'bad'],
    ['password', [], 'abc12345', 'ok'], ['password', [], 'abcdefgh', 'bad'], ['password', [], 'a1', 'bad'],
    ['minLength', [3], 'ab', 'bad'], ['minLength', [3], 'abc', 'ok'], ['maxLength', [3], 'abcd', 'bad'],
    ['intRange', [1, 5], '3', 'ok'], ['intRange', [1, 5], '6', 'bad'], ['intRange', [1, 5], '2.5', 'bad'],
    ['oneOf', [['a', 'b']], 'a', 'ok'], ['oneOf', [['a', 'b']], 'c', 'bad'],
    ['consent', [], true, 'ok'], ['consent', [], false, 'bad'],
    ['dateWithin', [0, 30], day(0), 'ok'], ['dateWithin', [0, 30], day(-1), 'bad'], ['dateWithin', [0, 30], day(31), 'bad'], ['dateWithin', [0, 30], '2026-02-30', 'bad'],
    ['dateTime', [], '2026-12-31T10:00', 'ok'], ['dateTime', [], '2026-12-31', 'bad'], ['dateTime', [], 'nope', 'bad'], ['httpsUrl', [], 'https://example.com/a.jpg', 'ok'], ['httpsUrl', [], 'http://example.com', 'bad'], ['httpsUrl', [], 'javascript:alert(1)', 'bad'], ['pastDate', [], day(-5), 'ok'], ['pastDate', [], day(5), 'bad']
  ];
  for (const [name, args, value, expected] of cases) {
    const s = server[name](...args)(value, {});
    const b = browser[name](...args)(value, {});
    assert.equal(s === null ? 'ok' : 'bad', expected, `server ${name}(${JSON.stringify(value)})`);
    assert.equal(b === null ? 'ok' : 'bad', expected, `browser ${name}(${JSON.stringify(value)})`);
    assert.equal(s, b, `message parity ${name}`);
  }
  // Cross-field + schema runner parity
  const schema = (m) => ({ password: [m.required(), m.password()], confirm: [m.required(), m.matches('password', 'Passwords do not match.')] });
  for (const input of [{ password: 'abc12345', confirm: 'abc12345' }, { password: 'abc12345', confirm: 'zzz' }, { password: 'x', confirm: '' }]) {
    assert.deepEqual(server.validate(input, schema(server)).errors, browser.validate(input, schema(browser)).errors);
  }
  assert.deepEqual(server.validate('nonsense', { a: [server.required()] }).errors, { a: 'This field is required.' });
  console.log('Validation rule tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
