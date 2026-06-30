const express = require('express');
const { indoorMapJson, toGeoJson } = require('../services/mapDataService');

const router = express.Router();
router.get('/buildings/:buildingId/geojson', async (req, res) => {
  const map = await indoorMapJson(req.params.buildingId);
  if (!map) return res.status(404).json({ error: 'Building not found' });
  res.json(toGeoJson(map));
});
module.exports = router;
