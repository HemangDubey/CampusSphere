const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, text, uuid } = require('../utils/query');

// Every route here is mounted behind requireAuth + requireRole('ADMIN'): employee records are private.
const schema = {
  employeeId: [r.required('Enter an employee ID.'), r.pattern(/^[A-Z]{2,4}-\d{3,6}$/, 'Use a format like EMP-1001 (2-4 capital letters, a dash, 3-6 digits).')],
  name: [r.required('Enter the employee name.'), r.minLength(2), r.maxLength(80)],
  designation: [r.required('Enter a designation.'), r.maxLength(80)],
  department: [r.required('Enter a department.'), r.maxLength(80)],
  email: [r.required('Enter an email address.'), r.email()],
  phone: [r.phoneIN()],
  joinedOn: [r.required('Enter the joining date.'), r.pastDate('The joining date cannot be in the future.')]
};
const data = (v) => ({
  employeeId: v.employeeId, name: v.name, designation: v.designation, department: v.department,
  email: v.email.toLowerCase(), phone: v.phone ? v.phone.replace(/[\s-]/g, '') : null, joinedOn: new Date(`${v.joinedOn}T00:00:00Z`)
});
const shape = (e) => ({ ...e, joinedOn: e.joinedOn.toISOString().slice(0, 10) });

function conflict(e) {
  if (e.code !== 'P2002') return e;
  const field = String(e.meta?.target || '').includes('email') ? 'email' : 'employeeId';
  return new HttpError(409, 'DUPLICATE', 'That value is already in use.', { [field]: field === 'email' ? 'This email is already used by another employee.' : 'This employee ID already exists.' });
}

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 12 });
    const q = text(req.query.q, 80);
    const department = text(req.query.department, 80);
    const where = { ...(department && { department }), ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }, { designation: { contains: q, mode: 'insensitive' } }] }) };
    const [total, rows, deps] = await Promise.all([
      db.employee.count({ where }), db.employee.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
      db.employee.findMany({ distinct: ['department'], select: { department: true } })
    ]);
    ok(res, { employees: rows.map(shape), departments: deps.map((d) => d.department).sort(), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const e = await db.employee.findUnique({ where: { id: uuid(req.params.id) } });
    if (!e) throw new HttpError(404, 'NOT_FOUND', 'Employee not found.');
    ok(res, { employee: shape(e) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, schema);
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const e = await db.employee.create({ data: data(values) }).catch((err) => { throw conflict(err); });
    ok(res, { employee: shape(e) }, { status: 201, message: 'Employee saved.' });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const { errors, values } = r.validate(req.body, schema);
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const e = await db.employee.update({ where: { id }, data: data(values) }).catch((err) => {
      if (err.code === 'P2025') throw new HttpError(404, 'NOT_FOUND', 'Employee not found.');
      throw conflict(err);
    });
    ok(res, { employee: shape(e) }, { message: 'Employee updated.' });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const { count } = await db.employee.deleteMany({ where: { id: uuid(req.params.id) } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Employee not found.');
    ok(res, null, { message: 'Employee deleted.' });
  } catch (e) { next(e); }
};
