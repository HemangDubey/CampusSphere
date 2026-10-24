const { PrismaClient } = require('@prisma/client');

// Single shared client. DATABASE_URL is read from the server environment only.
module.exports = new PrismaClient();
