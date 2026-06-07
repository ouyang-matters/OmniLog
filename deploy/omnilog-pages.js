const router = require('express').Router();

// GET /omnilog
router.get('/', (req, res) => {
  res.render('omnilog/index');
});

// GET /omnilog/docs
router.get('/docs', (req, res) => {
  res.render('omnilog/docs');
});

// GET /omnilog/pricing
router.get('/pricing', (req, res) => {
  res.render('omnilog/pricing');
});

// GET /omnilog/privacy
router.get('/privacy', (req, res) => {
  res.render('omnilog/privacy');
});

module.exports = router;
