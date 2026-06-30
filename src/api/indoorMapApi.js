async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function listBuildings() {
  return request('/api/buildings');
}

export async function createBuilding(data) {
  return request('/api/buildings', { method: 'POST', body: JSON.stringify(data) });
}

export async function listFloors(buildingId) {
  return request(`/api/buildings/${buildingId}/floors`);
}

export async function createFloor(buildingId, data) {
  return request(`/api/buildings/${buildingId}/floors`, { method: 'POST', body: JSON.stringify(data) });
}

export async function uploadSvgToFloor(floorId, file) {
  const form = new FormData();
  form.append('svg', file);
  return request(`/api/floors/${floorId}/upload-svg`, { method: 'POST', body: form, headers: {} });
}

export async function getIndoorMapJson(buildingId) {
  return request(`/api/buildings/${buildingId}/indoor-map-json`);
}

export async function cleanupFloorNoise(floorId) {
  return request(`/api/floors/${floorId}/cleanup-noise`, { method: 'POST', body: JSON.stringify({}) });
}

export async function getPublishedMap(buildingId = '') {
  const query = buildingId ? `?buildingId=${encodeURIComponent(buildingId)}` : '';
  return request(`/api/public/published-map${query}`);
}

export async function updateFeature(featureId, data) {
  return request(`/api/features/${featureId}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function createFeature(data) {
  return request('/api/features', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteFeature(featureId) {
  return request(`/api/features/${featureId}`, { method: 'DELETE' });
}

export async function publishBuilding(buildingId) {
  return request(`/api/buildings/${buildingId}/publish`, { method: 'POST', body: JSON.stringify({}) });
}

export async function searchBuilding(buildingId, q) {
  return request(`/api/search?buildingId=${encodeURIComponent(buildingId)}&q=${encodeURIComponent(q)}`);
}

export async function getGeoJson(buildingId) {
  return request(`/api/buildings/${buildingId}/geojson`);
}
