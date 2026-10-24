// Role -> permission map. The UI uses it only to decide which links to show; every endpoint re-checks
// with requirePermission() and, for per-record rules (own events, assigned requests), in the controller.
const ALL = [
  'event:manage', 'leave:review', 'request:review', 'healthcare:manage', 'resource:manage',
  'content:manage', 'employee:manage', 'user:manage', 'audit:view', 'report:view'
];

const MAP = {
  STUDENT: [],
  FACULTY: ['leave:review', 'request:review'],
  EVENT_ORGANIZER: ['event:manage'],
  HEALTHCARE_ADMIN: ['healthcare:manage'],
  CAMPUS_ADMIN: ['event:manage', 'leave:review', 'request:review', 'resource:manage', 'content:manage', 'employee:manage', 'audit:view', 'report:view'],
  SUPER_ADMIN: ALL
};

const ROLES = Object.keys(MAP);
const permissionsFor = (role) => MAP[role] || [];
const can = (user, permission) => Boolean(user) && permissionsFor(user.role).includes(permission);
// Roles that may see everything in a workflow (as opposed to only their own / assigned records).
const isAdmin = (user) => user?.role === 'CAMPUS_ADMIN' || user?.role === 'SUPER_ADMIN';
const isStaffRole = (role) => role !== 'STUDENT';

module.exports = { ROLES, ALL, permissionsFor, can, isAdmin, isStaffRole };
