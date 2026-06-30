const express = require('express');
const { prisma } = require('../db/prisma');
const { route } = require('../services/routingService');

const router = express.Router();
router.get('/buildings/:buildingId/route', async (req, res) => res.json(await route({ buildingId: req.params.buildingId, from: req.query.from, to: req.query.to })));
router.patch('/route-nodes/:nodeId', async (req, res) => res.json(await prisma.routeNode.update({ where: { id: req.params.nodeId }, data: req.body })));
router.patch('/route-edges/:edgeId', async (req, res) => res.json(await prisma.routeEdge.update({ where: { id: req.params.edgeId }, data: req.body })));
router.delete('/route-nodes/:nodeId', async (req, res) => res.json(await prisma.routeNode.delete({ where: { id: req.params.nodeId } })));
router.delete('/route-edges/:edgeId', async (req, res) => res.json(await prisma.routeEdge.delete({ where: { id: req.params.edgeId } })));
module.exports = router;
