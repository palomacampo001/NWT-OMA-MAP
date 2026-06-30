const express = require('express');
const { prisma } = require('../db/prisma');

const router = express.Router();

router.post('/', async (req, res) => res.status(201).json(await prisma.mapFeature.create({ data: req.body })));
router.patch('/:featureId', async (req, res) => res.json(await prisma.mapFeature.update({ where: { id: req.params.featureId }, data: req.body })));
router.delete('/:featureId', async (req, res) => res.json(await prisma.mapFeature.update({ where: { id: req.params.featureId }, data: { isDeleted: true, visible: false } })));
router.post('/:featureId/hide', async (req, res) => res.json(await prisma.mapFeature.update({ where: { id: req.params.featureId }, data: { visible: false } })));
router.post('/:featureId/restore', async (req, res) => res.json(await prisma.mapFeature.update({ where: { id: req.params.featureId }, data: { visible: true, isDeleted: false } })));
router.post('/bulk-update', async (req, res) => {
  const updates = req.body.updates || [];
  const results = [];
  for (const update of updates) results.push(await prisma.mapFeature.update({ where: { id: update.id }, data: update.data }));
  res.json({ updated: results.length, results });
});

module.exports = router;
