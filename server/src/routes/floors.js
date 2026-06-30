const express = require('express');
const multer = require('multer');
const { prisma } = require('../db/prisma');
const { importSvgToFloor } = require('../services/svgImportService');
const { floorIndoorMapJson, indoorMapJson, toGeoJson } = require('../services/mapDataService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/:floorId', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  if (!floor) return res.status(404).json({ error: 'Floor not found' });
  res.json(floor);
});
router.get('/:floorId/source-svg', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId }, include: { svgFile: true } });
  if (!floor?.svgFile?.rawText) return res.status(404).send('No SVG background exists for this floor.');
  res.type('image/svg+xml').send(floor.svgFile.rawText);
});
router.patch('/:floorId', async (req, res) => res.json(await prisma.floor.update({ where: { id: req.params.floorId }, data: req.body })));
router.delete('/:floorId', async (req, res) => res.json(await prisma.floor.delete({ where: { id: req.params.floorId } })));

router.post('/:floorId/upload-svg', upload.single('svg'), async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  if (!floor) return res.status(404).json({ error: 'Floor not found' });
  const svgText = req.file ? req.file.buffer.toString('utf8') : req.body.svgText;
  if (!svgText) return res.status(400).json({ error: 'SVG file or svgText is required.' });
  const report = await importSvgToFloor({
    buildingId: floor.buildingId,
    floorId: floor.id,
    filename: req.file?.originalname || req.body.filename || 'uploaded.svg',
    mimeType: req.file?.mimetype || 'image/svg+xml',
    svgText,
  });
  res.json(report);
});

router.get('/:floorId/features', async (req, res) => {
  const features = await prisma.mapFeature.findMany({ where: { floorId: req.params.floorId } });
  res.json(features.filter((feature) => !feature.isDeleted));
});
router.post('/:floorId/cleanup-noise', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  const viewBox = JSON.parse(floor?.viewBox || '[0,0,1200,800]');
  const mapArea = viewBox[2] * viewBox[3];
  const features = await prisma.mapFeature.findMany({ where: { floorId: req.params.floorId } });
  let hidden = 0;
  for (const feature of features) {
    const bbox = JSON.parse(feature.bboxJson || '[0,0,0,0]');
    const geometry = JSON.parse(feature.geometryJson || '{}');
    const label = `${feature.displayName || ''} ${feature.name || ''} ${feature.roomNumber || ''}`.trim().toLowerCase();
    const sourceMetadata = JSON.parse(feature.sourceMetadataJson || '{}');
    const sourceTag = sourceMetadata.tag || (sourceMetadata.d ? 'path' : sourceMetadata.points ? 'polygon' : sourceMetadata.width !== undefined ? 'rect' : '');
    const sourceId = String(sourceMetadata.id || '').trim().toLowerCase();
    const displayName = String(feature.displayName || '').trim().toLowerCase();
    const name = String(feature.name || '').trim().toLowerCase();
    const sourceOnly = sourceId && (displayName === sourceId || name === sourceId);
    const technicalId = /^[a-z]?\d+[a-z]?\d*$/i.test(displayName) && !feature.roomNumber;
    const usefulLabel = label && !sourceOnly && !technicalId && !['unknown', 'room', 'decorative'].includes(label);
    const areaRatio = mapArea ? (bbox[2] * bbox[3]) / mapArea : 0;
    const skinny = Math.max(bbox[2], bbox[3]) / Math.max(1, Math.min(bbox[2], bbox[3])) > 10;
    const oversizedReference = areaRatio > 0.85 && !usefulLabel;
    const manualApproved = sourceMetadata.manualApproved || sourceMetadata.manual;
    const unsafeSource = sourceTag === 'path' || sourceTag === 'line' || sourceTag === 'polyline' || sourceMetadata.d;
    const shouldHide = !manualApproved && (
      geometry.type === 'LineString'
      || unsafeSource
      || feature.category === 'corridor'
      || feature.category === 'unknown'
      || feature.category === 'decorative'
      || feature.category === 'noise'
      || feature.confidence < 0.75
      || !['room', 'poi'].includes(feature.type)
      || (geometry.type === 'Polygon' && !['rect', 'polygon'].includes(sourceTag))
      || (geometry.type === 'Polygon' && !usefulLabel)
      || oversizedReference
      || (!usefulLabel && (areaRatio < 0.0012 || skinny))
      || skinny
    );
    if (shouldHide) {
      await prisma.mapFeature.update({ where: { id: feature.id }, data: { visible: false, category: 'decorative', type: 'decorative' } });
      hidden += 1;
    }
  }
  res.json({ floorId: req.params.floorId, hidden });
});
router.post('/:floorId/features', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  res.status(201).json(await prisma.mapFeature.create({ data: { ...req.body, floorId: floor.id, buildingId: floor.buildingId } }));
});
router.get('/:floorId/indoor-map-json', async (req, res) => res.json(await floorIndoorMapJson(req.params.floorId)));
router.get('/:floorId/geojson', async (req, res) => {
  const map = await floorIndoorMapJson(req.params.floorId);
  res.json(toGeoJson(map, req.params.floorId));
});
router.post('/:floorId/import-geojson', async (req, res) => res.status(501).json({ error: 'GeoJSON import placeholder: conversion to MapFeature records is not implemented yet.' }));

router.post('/:floorId/route-nodes', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  res.status(201).json(await prisma.routeNode.create({ data: { ...req.body, floorId: floor.id, buildingId: floor.buildingId } }));
});
router.post('/:floorId/route-edges', async (req, res) => {
  const floor = await prisma.floor.findUnique({ where: { id: req.params.floorId } });
  res.status(201).json(await prisma.routeEdge.create({ data: { ...req.body, floorId: floor.id, buildingId: floor.buildingId } }));
});

module.exports = router;
