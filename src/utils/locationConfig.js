export const BUILDING_GEOFENCE = {
  id: 'us-oma',
  name: 'US OMA',
  // Replace with surveyed building coordinates before production handoff.
  center: { lat: 41.2565, lng: -95.9345 },
  radiusMeters: 120,
};

export const BUILDING_START_ANCHORS = [
  {
    id: 'street-entrance',
    name: 'Street Entrance',
    floorId: 'floor-us-oma-01',
    type: 'entrance',
    mapPoint: { x: 145, y: 570 },
    isDefault: true,
  },
  {
    id: 'reception',
    name: 'Reception',
    floorId: 'floor-us-oma-01',
    type: 'reception',
    mapPoint: { x: 190, y: 500 },
  },
];

export function haversineDistanceMeters(a, b) {
  const earthRadius = 6371000;
  const toRad = (degrees) => degrees * (Math.PI / 180);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function isInsideBuildingGeofence(userLatLng, geofence = BUILDING_GEOFENCE) {
  return haversineDistanceMeters(userLatLng, geofence.center) <= geofence.radiusMeters;
}

export function formatDistanceFeet(meters) {
  const feet = Math.max(0, Math.round(meters * 3.28084));
  if (feet < 1000) return `${feet} ft`;
  return `${(feet / 5280).toFixed(1)} mi`;
}

export function entranceAnchorForFloor(floor) {
  if (!floor) return null;
  const explicit = BUILDING_START_ANCHORS.find((anchor) => anchor.floorId === floor.id && anchor.isDefault)
    || BUILDING_START_ANCHORS.find((anchor) => anchor.floorId === floor.id);
  const preferred = floor.features?.find((feature) => feature.visible !== false && feature.isDefaultStart && feature.geometry?.type === 'Point')
    || floor.features?.find((feature) => feature.visible !== false && feature.id === 'poi-main-ibm-entrance' && feature.geometry?.type === 'Point')
    || floor.features?.find((feature) => feature.visible !== false && ['entrance', 'reception'].includes(feature.category) && feature.geometry?.type === 'Point')
    || floor.features?.find((feature) => feature.visible !== false && feature.geometry?.type === 'Point' && /main ibm entrance|entrance|vestibule|lobby|reception|01A23/i.test(`${feature.displayName || ''} ${feature.name || ''} ${feature.roomNumber || ''}`));
  if (preferred) {
    return {
      id: preferred.id,
      name: preferred.displayName || preferred.name || preferred.roomNumber || 'Main Entrance',
      floorId: floor.id,
      type: preferred.category,
      mapPoint: { x: preferred.geometry.coordinates[0], y: preferred.geometry.coordinates[1] },
    };
  }
  if (explicit) return explicit;
  const [x, y, width, height] = floor.viewBox || [0, 0, 1200, 800];
  return {
    id: 'main-entrance',
    name: 'Main Entrance',
    floorId: floor.id,
    type: 'entrance',
    mapPoint: { x: x + width * 0.12, y: y + height * 0.72 },
  };
}

export function getDefaultStartAnchor(floors = []) {
  const explicit = BUILDING_START_ANCHORS.find((anchor) => anchor.isDefault);
  const explicitFloor = explicit && floors.find((floor) => floor.id === explicit.floorId);
  if (explicitFloor) return entranceAnchorForFloor(explicitFloor);
  return entranceAnchorForFloor(floors[0]);
}
