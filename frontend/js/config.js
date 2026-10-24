// Frontend runtime configuration. Public values only: anything here is visible to every visitor.
// Leave apiBase empty when the API is served from the same origin (the default, and also the case when
// a host proxies /api to the backend). Set it to the backend's origin, e.g. "https://api.example.com",
// only for a cross-origin deployment; that also needs CORS_ORIGINS and COOKIE_SAMESITE=none on the backend.
export const config = { apiBase: '' };
