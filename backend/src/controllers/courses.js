const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { uuid } = require('../utils/query');

// SAMPLE CATALOGUE for demonstration. Replace with your institution's verified course list.
const CATALOG = [
  { code: 'CSE101', title: 'Introduction to Programming', credits: 4 },
  { code: 'CSE201', title: 'Web Technologies', credits: 3 },
  { code: 'CSE305', title: 'Database Systems', credits: 4 },
  { code: 'MAT102', title: 'Discrete Mathematics', credits: 3 },
  { code: 'HUM110', title: 'Technical Communication', credits: 2 }
];
const CODES = CATALOG.map((c) => c.code);
const currentYear = new Date().getFullYear();
const YEARS = [`${currentYear - 1}-${currentYear}`, `${currentYear}-${currentYear + 1}`];

const schema = {
  courseCode: [r.required('Choose a course.'), r.oneOf(CODES)],
  semester: [r.required('Choose a semester.'), r.oneOf(['ODD', 'EVEN', 'SUMMER'])],
  academicYear: [r.required('Choose an academic year.'), r.oneOf(YEARS)],
  notes: [r.maxLength(200)],
  consent: [r.consent('Please confirm your details are correct.')]
};
const shape = (c) => ({ id: c.id, courseCode: c.courseCode, title: CATALOG.find((x) => x.code === c.courseCode)?.title, semester: c.semester, academicYear: c.academicYear, notes: c.notes, createdAt: c.createdAt });

exports.catalog = (req, res) => ok(res, { demo: true, courses: CATALOG, academicYears: YEARS });

exports.mine = async (req, res, next) => {
  try {
    const rows = await db.courseRegistration.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    ok(res, { registrations: rows.map(shape) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, schema);
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const row = await db.courseRegistration.create({ data: { userId: req.user.id, courseCode: values.courseCode, semester: values.semester, academicYear: values.academicYear, notes: values.notes || null } })
      .catch((e) => { throw e.code === 'P2002' ? new HttpError(409, 'ALREADY_REGISTERED', 'You have already registered for this course in that term.', { courseCode: 'Already registered for this term.' }) : e; });
    ok(res, { registration: shape(row) }, { status: 201, message: 'Course registration saved.' });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const { count } = await db.courseRegistration.deleteMany({ where: { id: uuid(req.params.id), userId: req.user.id } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
    ok(res, null, { message: 'Registration removed.' });
  } catch (e) { next(e); }
};
