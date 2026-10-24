const { Router } = require('express');
const events = require('../controllers/events');
const destinations = require('../controllers/destinations');
const resources = require('../controllers/resources');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = Router();

// Events. "mine" is declared before ":id" so it is not read as an id.
router.get('/events', optionalAuth, events.list);
router.get('/events/mine', requireAuth, events.mine);
router.get('/events/:id', optionalAuth, events.get);
router.post('/events/:id/register', requireAuth, events.register);
router.delete('/events/:id/register', requireAuth, events.cancel);

// Travel explorer
router.get('/destinations', optionalAuth, destinations.list);
router.get('/destinations/favorites', requireAuth, destinations.favorites);
router.get('/destinations/:slug', optionalAuth, destinations.get);
router.put('/destinations/:id/favorite', requireAuth, destinations.addFavorite);
router.delete('/destinations/:id/favorite', requireAuth, destinations.removeFavorite);

// Campus resources
router.get('/resources', resources.list);
router.get('/resources/:id', resources.get);

module.exports = router;
