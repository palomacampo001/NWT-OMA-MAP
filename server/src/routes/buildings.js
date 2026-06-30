const express = require('express');
const { prisma } = require('../db/prisma');
const { indoorMapJson } = require('../services/mapDataService');
const { publish, createVersion, publishedMap } = require('../services/versionService');

const router = express.Router();

router.get('/', async (req, res) => res.json(await prisma.building.findMany({ orderBy: { createdAt: 'desc' } })));
router.post('/', async (req, res) => res.status(201).json(await prisma.building.create({ data: req.body })));
router.get('/:buildingId', async (req, res) => {
  const building = await prisma.building.findUnique({ where: { id: req.params.buildingId } });
  if (!building) return res.status(404).json({ error: 'Building not found' });
  res.json(building);
});
router.patch('/:buildingId', async (req, res) => res.json(await prisma.building.update({ where: { id: req.params.buildingId }, data: req.body })));
router.delete('/:buildingId', async (req, res) => res.json(await prisma.building.delete({ where: { id: req.params.buildingId } })));

router.get('/:buildingId/floors', async (req, res) => res.json(await prisma.floor.findMany({ where: { buildingId: req.params.buildingId }, orderBy: { sortOrder: 'asc' } })));
router.post('/:buildingId/floors', async (req, res) => {
  const count = await prisma.floor.count({ where: { buildingId: req.params.buildingId } });
  res.status(201).json(await prisma.floor.create({
    data: { buildingId: req.params.buildingId, name: req.body.name || `Floor ${count + 1}`, levelNumber: req.body.levelNumber ?? count + 1, sortOrder: req.body.sortOrder ?? count },
  }));
});

router.get('/:buildingId/indoor-map-json', async (req, res) => {
  const map = await indoorMapJson(req.params.buildingId);
  if (!map) return res.status(404).json({ error: 'Building not found' });
  res.json(map);
});

router.get('/:buildingId/published', async (req, res) => {
  const map = await publishedMap(req.params.buildingId);
  if (!map) return res.status(404).json({ error: 'No published map version exists.' });
  res.json(map);
});

router.get('/:buildingId/versions', async (req, res) => res.json(await prisma.mapVersion.findMany({ where: { buildingId: req.params.buildingId }, orderBy: { createdAt: 'desc' } })));
router.post('/:buildingId/versions', async (req, res) => res.status(201).json(await createVersion(req.params.buildingId, req.body.versionName, req.body.status || 'draft')));
router.post('/:buildingId/publish', async (req, res) => res.json(await publish(req.params.buildingId)));
router.post('/:buildingId/archive-version', async (req, res) => res.json(await prisma.mapVersion.update({ where: { id: req.body.versionId }, data: { status: 'archived' } })));

module.exports = router;
