const { prisma } = require('../db/prisma');

function dijkstra(nodes, edges, startId, endId) {
  const distances = new Map(nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map();
  const unvisited = new Set(nodes.map((node) => node.id));
  distances.set(startId, 0);
  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => distances.get(a) - distances.get(b))[0];
    if (!current || distances.get(current) === Number.POSITIVE_INFINITY) break;
    unvisited.delete(current);
    if (current === endId) break;
    const nextEdges = edges.filter((edge) => edge.accessible && (edge.fromNodeId === current || edge.toNodeId === current));
    for (const edge of nextEdges) {
      const neighbor = edge.fromNodeId === current ? edge.toNodeId : edge.fromNodeId;
      if (!unvisited.has(neighbor)) continue;
      const score = distances.get(current) + edge.distance * edge.weight;
      if (score < distances.get(neighbor)) {
        distances.set(neighbor, score);
        previous.set(neighbor, current);
      }
    }
  }
  const path = [];
  let current = endId;
  while (current) {
    path.unshift(current);
    current = previous.get(current);
  }
  return path[0] === startId ? { distance: distances.get(endId), nodeIds: path } : null;
}

async function route({ buildingId, from, to }) {
  const nodes = await prisma.routeNode.findMany({ where: { buildingId } });
  const edges = await prisma.routeEdge.findMany({ where: { buildingId } });
  if (!nodes.length || !edges.length) {
    return { status: 'not_available', message: 'Routing requires route nodes and edges to be created for this floor.' };
  }
  const result = dijkstra(nodes, edges, from, to);
  if (!result) return { status: 'not_available', message: 'No route exists between the selected route nodes.' };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return { status: 'ok', distance: result.distance, nodes: result.nodeIds.map((id) => byId.get(id)) };
}

module.exports = { route };
