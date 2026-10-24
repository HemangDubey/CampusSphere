const { Router } = require('express');
const destinations = require('../controllers/destinations');
const trips = require('../controllers/trips');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = Router();

// Destinations. Fixed paths are declared before ":slug".
router.get('/destinations', optionalAuth, destinations.list);
router.get('/destinations/favorites', requireAuth, destinations.favorites);
router.get('/destinations/recent', requireAuth, destinations.recent);
router.get('/destinations/:slug', optionalAuth, destinations.get);
router.put('/destinations/:id/favorite', requireAuth, destinations.addFavorite);
router.delete('/destinations/:id/favorite', requireAuth, destinations.removeFavorite);

// Trip planner (owner / member checks live in the controller)
router.get('/trips', requireAuth, trips.list);
router.post('/trips', requireAuth, trips.create);
router.get('/trips/shared/:token', trips.shared);
router.get('/trips/:id', requireAuth, trips.get);
router.put('/trips/:id', requireAuth, trips.update);
router.delete('/trips/:id', requireAuth, trips.remove);
router.put('/trips/:id/items', requireAuth, trips.setItems);
router.post('/trips/:id/duplicate', requireAuth, trips.duplicate);
router.post('/trips/:id/share', requireAuth, trips.setShare);
router.post('/trips/:id/members', requireAuth, trips.addMember);
router.delete('/trips/:id/members/:userId', requireAuth, trips.removeMember);

module.exports = router;
