const { prisma } = require('../db/prisma');
const { indoorMapJson } = require('./mapDataService');

async function createVersion(buildingId, versionName = 'Draft version', status = 'draft') {
  const snapshot = await indoorMapJson(buildingId, { includeSvgBackground: false });
  if (!snapshot || !snapshot.floors.length) throw new Error('Cannot version an empty building.');
  return prisma.mapVersion.create({
    data: { buildingId, versionName, status, snapshotJson: JSON.stringify(snapshot), publishedAt: status === 'published' ? new Date() : null },
  });
}

async function publish(buildingId) {
  await prisma.mapVersion.updateMany({ where: { buildingId, status: 'published' }, data: { status: 'archived' } });
  return createVersion(buildingId, `Published ${new Date().toISOString()}`, 'published');
}

async function publishedMap(buildingId) {
  const version = await prisma.mapVersion.findFirst({ where: { buildingId, status: 'published' }, orderBy: { publishedAt: 'desc' } });
  if (!version) return null;
  const snapshot = JSON.parse(version.snapshotJson);
  const live = await indoorMapJson(buildingId, { includeSvgBackground: true });
  if (!live) return snapshot;
  return {
    ...snapshot,
    floors: snapshot.floors.map((floor) => {
      const liveFloor = live.floors.find((item) => item.id === floor.id);
      return {
        ...floor,
        svgBackground: liveFloor?.svgBackground || '',
        svgBackgroundUrl: liveFloor?.svgBackgroundUrl || '',
        reviewStats: liveFloor?.reviewStats || floor.reviewStats,
      };
    }),
  };
}

module.exports = { createVersion, publish, publishedMap };
