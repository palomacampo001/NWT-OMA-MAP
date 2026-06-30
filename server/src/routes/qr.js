const express = require('express');
const { prisma } = require('../db/prisma');

const router = express.Router();
router.get('/buildings/:buildingId/qr-anchors', async (req, res) => res.json(await prisma.qrAnchor.findMany({ where: { buildingId: req.params.buildingId } })));
router.post('/buildings/:buildingId/qr-anchors', async (req, res) => res.status(201).json(await prisma.qrAnchor.create({ data: { ...req.body, buildingId: req.params.buildingId } })));
router.get('/qr/:code', async (req, res) => {
  const anchor = await prisma.qrAnchor.findUnique({ where: { code: req.params.code }, include: { floor: true, routeNode: true } });
  if (!anchor) return res.status(404).json({ error: 'QR anchor not found' });
  res.json(anchor);
});
router.patch('/qr-anchors/:qrAnchorId', async (req, res) => res.json(await prisma.qrAnchor.update({ where: { id: req.params.qrAnchorId }, data: req.body })));
router.delete('/qr-anchors/:qrAnchorId', async (req, res) => res.json(await prisma.qrAnchor.delete({ where: { id: req.params.qrAnchorId } })));
module.exports = router;
