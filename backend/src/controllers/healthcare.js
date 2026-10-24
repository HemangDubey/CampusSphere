const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { uuid } = require('../utils/query');

// SAMPLE DATA ONLY. None of these providers are real or connected to this app.
const DEPARTMENTS = ['General consultation', 'Dental', 'Eye care', 'Physiotherapy', 'Wellbeing counselling'];
const INFO = {
  demo: true,
  disclaimer: 'CampusSphere is a student project. These are sample listings; appointment requests are stored for demonstration only and are not sent to any hospital or clinic. This is not a medical or diagnosis service.',
  emergency: 'In an emergency, call your local emergency number (112 in India) or go to the nearest hospital. Do not use this app.',
  categories: DEPARTMENTS.map((name) => ({ name })),
  hospitals: [
    { id: 'h1', name: 'Campus Health Centre (sample)', kind: 'On-campus clinic', summary: 'Sample listing for first-contact care. Hours and contact details are not provided.' },
    { id: 'h2', name: 'City General Hospital (fictional)', kind: 'Multi-speciality hospital', summary: 'Fictional hospital used to demonstrate the card layout.' }
  ],
  doctors: [
    { id: 'd1', name: 'Dr. A. Sample (fictional)', speciality: 'General consultation', experience: 'Sample profile' },
    { id: 'd2', name: 'Dr. B. Example (fictional)', speciality: 'Dental', experience: 'Sample profile' },
    { id: 'd3', name: 'Dr. C. Demo (fictional)', speciality: 'Eye care', experience: 'Sample profile' },
    { id: 'd4', name: 'Dr. D. Placeholder (fictional)', speciality: 'Physiotherapy', experience: 'Sample profile' }
  ]
};

const schema = {
  patientName: [r.required('Enter the patient name.'), r.minLength(2), r.maxLength(80)],
  phone: [r.required('Enter a contact number.'), r.phoneIN()],
  department: [r.required('Choose a department.'), r.oneOf(DEPARTMENTS)],
  preferredDate: [r.required('Choose a preferred date.'), r.dateWithin(1, 90, 'Choose a date between tomorrow and 90 days from now.')],
  timePreference: [r.required('Choose a time preference.'), r.oneOf(['MORNING', 'AFTERNOON', 'EVENING'])],
  reason: [r.required('Briefly describe the reason for the visit.'), r.minLength(5), r.maxLength(500)],
  consent: [r.consent('Please confirm you understand this is a demonstration request.')]
};

const shape = (a) => ({
  id: a.id, patientName: a.patientName, department: a.department, preferredDate: a.preferredDate.toISOString().slice(0, 10),
  timePreference: a.timePreference, reason: a.reason, status: a.status, createdAt: a.createdAt, demo: true
});

exports.info = (req, res) => ok(res, INFO);

exports.create = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, schema);
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const a = await db.appointment.create({
      data: {
        userId: req.user.id, patientName: values.patientName, phone: values.phone.replace(/[\s-]/g, ''), department: values.department,
        preferredDate: new Date(`${values.preferredDate}T00:00:00Z`), timePreference: values.timePreference, reason: values.reason
      }
    });
    ok(res, { appointment: shape(a) }, { status: 201, message: 'Demonstration request recorded. No real appointment has been booked.' });
  } catch (e) { next(e); }
};

// Users only ever see their own requests; the phone number is never returned.
exports.mine = async (req, res, next) => {
  try {
    const rows = await db.appointment.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    ok(res, { appointments: rows.map(shape) });
  } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const { count } = await db.appointment.updateMany({ where: { id, userId: req.user.id, status: 'REQUESTED' }, data: { status: 'CANCELLED' } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Request not found.');
    ok(res, null, { message: 'Request cancelled.' });
  } catch (e) { next(e); }
};
