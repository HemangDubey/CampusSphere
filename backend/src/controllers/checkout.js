const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');

// DEMONSTRATION CHECKOUT. No payment gateway is connected: nothing is charged, stored or sent anywhere,
// and no transaction id is ever produced. Prices live here so the server, not the browser, decides totals.
const CATALOG = {
  'symposium-pass': { name: 'Symposium pass', price: 500 },
  'workshop-kit': { name: 'Workshop kit', price: 300 },
  'event-tshirt': { name: 'Event T-shirt', price: 250 }
};
const TAX_RATE = 0.18; // illustrative tax, for the calculation demo only
const FEE = 20; // illustrative flat convenience fee
const METHODS = ['upi', 'card', 'netbanking'];
const OUTCOMES = ['approve', 'decline', 'cancel'];
const FORBIDDEN = /card.?number|cvv|cvc|expiry|^pin$|^otp$|password|account.?number/i;

const schema = {
  name: [r.required('Enter your name.'), r.minLength(2), r.maxLength(80)],
  email: [r.required('Enter your email.'), r.email()],
  phone: [r.required('Enter your mobile number.'), r.phoneIN()],
  address: [r.required('Enter your billing address.'), r.minLength(5), r.maxLength(150)],
  city: [r.required('Enter your city.'), r.maxLength(60)],
  pincode: [r.required('Enter your PIN code.'), r.pattern(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code.')],
  method: [r.required('Choose a payment method.'), r.oneOf(METHODS)],
  outcome: [r.required('Choose a test outcome.'), r.oneOf(OUTCOMES)],
  consent: [r.consent('Please confirm you understand no payment is made.')]
};

function price(items) {
  if (!Array.isArray(items) || !items.length || items.length > 10) return { error: 'Add at least one item.' };
  const lines = [];
  for (const it of items) {
    const p = CATALOG[it?.id];
    if (!p) return { error: 'Unknown item in cart.' };
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) return { error: 'Quantity must be between 1 and 10.' };
    lines.push({ id: it.id, name: p.name, unitPrice: p.price, quantity: qty, lineTotal: p.price * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  return { lines, subtotal, tax, fee: FEE, total: Math.round((subtotal + tax + FEE) * 100) / 100 };
}

exports.catalog = (req, res) => ok(res, { demo: true, items: Object.entries(CATALOG).map(([id, v]) => ({ id, ...v })), taxRate: TAX_RATE, fee: FEE });

exports.submit = (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (Object.keys(body).some((k) => FORBIDDEN.test(k))) {
      throw new HttpError(400, 'SENSITIVE_DATA_REJECTED', 'Card numbers and other payment credentials are never accepted by this demo.');
    }
    const { errors, values } = r.validate(body, schema);
    const priced = price(body.items);
    if (priced.error) errors.items = priced.error;
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);

    const summary = { lines: priced.lines, subtotal: priced.subtotal, tax: priced.tax, fee: priced.fee, total: priced.total, currency: 'INR' };
    const byOutcome = {
      approve: { status: 200, result: 'DEMO_APPROVED', message: 'Your order was approved. No payment was made and nothing was charged.' },
      decline: { status: 402, result: 'DEMO_DECLINED', message: 'The payment was declined. No money moved.' },
      cancel: { status: 200, result: 'DEMO_CANCELLED', message: 'The checkout was cancelled. Nothing was charged.' }
    }[values.outcome];
    const payload = { success: byOutcome.status < 400, data: { demo: true, result: byOutcome.result, summary }, message: byOutcome.message };
    if (byOutcome.status >= 400) {
      return res.status(byOutcome.status).json({ success: false, error: { code: byOutcome.result, message: byOutcome.message }, data: { demo: true, result: byOutcome.result, summary } });
    }
    return res.status(byOutcome.status).json(payload);
  } catch (e) { return next(e); }
};
