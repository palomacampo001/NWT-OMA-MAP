export function convertToGeoJson(mapData) {
  return {
    type: 'FeatureCollection',
    features: mapData.floors.flatMap((floor) =>
      floor.features
        .filter((feature) => feature.visible !== false && feature.category !== 'decorative')
        .map((feature) => ({
          type: 'Feature',
          properties: {
            id: feature.id,
            name: feature.name,
            displayName: feature.displayName,
            type: feature.type,
            category: feature.category,
            floor: floor.id.replace(/^floor-/, ''),
            floorName: floor.name,
            roomNumber: feature.roomNumber,
            confidence: feature.confidence,
          },
          geometry: feature.geometry,
        })),
    ),
  };
}
