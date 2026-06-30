const express = require('express');
const { search } = require('../services/searchService');

const router = express.Router();
router.get('/', async (req, res) => res.json(await search({ buildingId: req.query.buildingId, q: req.query.q })));
module.exports = router;
