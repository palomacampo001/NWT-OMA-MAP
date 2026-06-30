const { prisma } = require('../db/prisma');

async function search({ buildingId, q }) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return [];
  const floors = await prisma.floor.findMany({ where: { buildingId } });
  const floorMatches = floors.filter((floor) => floor.name.toLowerCase().includes(query)).map((floor) => ({ type: 'floor', floor, label: floor.name }));
  const features = await prisma.mapFeature.findMany({
    where: { buildingId, visible: true },
    include: { floor: true },
  });
  const featureMatches = features.filter((feature) => !feature.isDeleted && `${feature.name || ''} ${feature.displayName || ''} ${feature.roomNumber || ''} ${feature.category}`.toLowerCase().includes(query))
    .map((feature) => ({ type: 'feature', feature, floor: feature.floor, label: feature.displayName || feature.name || feature.roomNumber || feature.category }));
  const pois = await prisma.pOI.findMany({ where: { buildingId, searchable: true }, include: { floor: true } });
  const poiMatches = pois.filter((poi) => `${poi.name} ${poi.category}`.toLowerCase().includes(query)).map((poi) => ({ type: 'poi', poi, floor: poi.floor, label: poi.name }));
  return [...featureMatches, ...poiMatches, ...floorMatches].slice(0, 50);
}

module.exports = { search };
