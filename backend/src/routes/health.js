const { Router } = require('express');
const { ok } = require('../utils/response');

const router = Router();
router.get('/health', (req, res) => ok(res, { status: 'ok', service: 'campussphere', time: new Date().toISOString() }));
module.exports = router;
