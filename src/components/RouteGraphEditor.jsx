import { useMemo, useState } from 'react';

const nodeTypes = ['hallway', 'intersection', 'turn', 'doorway', 'destination_approach', 'entrance', 'reception', 'elevator', 'escalator', 'stair'];

function graphStatusLabel(status) {
  if (status === 'published') return 'Published';
  if (status === 'admin_reviewed') return 'Reviewed';
  return 'Generated suggestion';
}

function edgeDistance(from, to) {
  if (!from || !to) return 0;
  return Math.round(Math.hypot(from.x - to.x, from.y - to.y));
}

export default function RouteGraphEditor({
  floor,
  graph,
  routeNodeMode,
  routePathMode,
  routePathDraftCount,
  onStartNodePlacement,
  onStartPathDrawing,
  onFinishPathDrawing,
  onCancelPathDrawing,
  onUpdateGraph,
  onGenerateGraph,
}) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [nodeType, setNodeType] = useState('hallway');
  const nodeCount = graph?.nodes?.length || 0;
  const edgeCount = graph?.edges?.length || 0;
  const selectedNodes = useMemo(() => selected.map((id) => graph?.nodes?.find((node) => node.id === id)).filter(Boolean), [selected, graph]);
  const visibleNodes = useMemo(() => {
    const nodes = graph?.nodes || [];
    const adminNodes = nodes.filter((node) => node.source === 'admin').slice(-60).reverse();
    const typedNodes = nodes.filter((node) => ['elevator', 'escalator', 'stair', 'entrance', 'reception'].includes(node.type)).slice(0, 80);
    const seen = new Set();
    return [...adminNodes, ...typedNodes, ...nodes.slice(0, 40)].filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    }).slice(0, 140);
  }, [graph]);
  const visibleEdges = useMemo(() => {
    const edges = graph?.edges || [];
    const adminEdges = edges.filter((edge) => edge.source === 'admin').slice(-80).reverse();
    const seen = new Set(adminEdges.map((edge) => edge.id));
    return [...adminEdges, ...edges.filter((edge) => !seen.has(edge.id)).slice(0, 160)];
  }, [graph]);

  function update(updater) {
    onUpdateGraph((current) => updater({ floorId: floor.id, nodes: [], edges: [], ...current }));
  }

  function addNode() {
    const [x, y, width, height] = floor.viewBox || [0, 0, 1200, 800];
    const node = {
      id: `${floor.id}-manual-${Date.now().toString(36)}`,
      floorId: floor.id,
      x: Math.round(x + width / 2),
      y: Math.round(y + height / 2),
      type: nodeType,
      name: `${nodeType.replace('_', ' ')} node`,
      source: 'admin',
    };
    update((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected([node.id]);
  }

  function connectSelected() {
    if (selected.length !== 2) return;
    const [fromNodeId, toNodeId] = selected;
    update((current) => {
      if (current.edges.some((edge) => [edge.fromNodeId, edge.toNodeId].sort().join('|') === [fromNodeId, toNodeId].sort().join('|'))) return current;
      const from = current.nodes.find((node) => node.id === fromNodeId);
      const to = current.nodes.find((node) => node.id === toNodeId);
      return {
        ...current,
        edges: [...current.edges, {
          id: `${floor.id}-edge-${Date.now().toString(36)}`,
          floorId: floor.id,
          fromNodeId,
          toNodeId,
          distance: edgeDistance(from, to),
          accessible: true,
          source: 'admin',
        }],
      };
    });
  }

  function deleteSelected() {
    update((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !selected.includes(node.id)),
      edges: current.edges.filter((edge) => !selected.includes(edge.fromNodeId) && !selected.includes(edge.toNodeId)),
    }));
    setSelected([]);
  }

  function updateSelectedType() {
    if (!selected.length) return;
    update((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (selected.includes(node.id) ? { ...node, type: nodeType } : node)),
    }));
  }

  function snapSelectedToPoi() {
    if (selected.length !== 1) return;
    const pois = (floor.features || []).filter((feature) => feature.visible !== false && feature.geometry?.type === 'Point');
    const currentNode = graph?.nodes?.find((node) => node.id === selected[0]);
    if (!currentNode || !pois.length) return;
    const nearest = pois
      .map((feature) => ({
        feature,
        distance: Math.hypot(feature.geometry.coordinates[0] - currentNode.x, feature.geometry.coordinates[1] - currentNode.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.feature;
    if (!nearest) return;
    update((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selected[0]
        ? {
          ...node,
          x: nearest.geometry.coordinates[0],
          y: nearest.geometry.coordinates[1],
          name: nearest.displayName || nearest.name || nearest.roomNumber || node.name,
        }
        : node)),
    }));
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return;
    update((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== selectedEdgeId) }));
    setSelectedEdgeId('');
  }

  function exportGraph() {
    navigator.clipboard?.writeText(JSON.stringify(graph || { floorId: floor.id, nodes: [], edges: [] }, null, 2));
  }

  function importGraph(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const parsed = JSON.parse(text);
      update(() => ({
        floorId: floor.id,
        status: parsed.status || 'generated_suggestion',
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
      }));
      setSelected([]);
    }).catch(() => {});
  }

  return (
    <section className="panel-section route-graph-editor">
      <button className={visible ? 'primary-button active' : 'secondary-button'} onClick={() => setVisible((value) => !value)}>
        {visible ? 'Hide route graph editor' : 'Edit route graph'}
      </button>
      {visible && (
        <div className="route-graph-tools">
          <p className="muted">{nodeCount} nodes · {edgeCount} edges. Routes draw only along connected edges.</p>
          <div className={`route-graph-status route-graph-status-${graph?.status || 'admin_reviewed'}`}>
            {graphStatusLabel(graph?.status || 'admin_reviewed')}
          </div>
          <div className="tool-row">
            <button className="primary-button" onClick={onGenerateGraph}>Generate hallway graph</button>
            <button className="secondary-button" onClick={() => update((current) => ({ ...current, status: 'admin_reviewed' }))} disabled={!nodeCount}>
              Save as reviewed
            </button>
            <button className="secondary-button" onClick={() => update((current) => ({ ...current, status: 'published' }))} disabled={!nodeCount}>
              Publish graph
            </button>
          </div>
          <label>
            Node type
            <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
              {nodeTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
            </select>
          </label>
          <div className="route-draw-card">
            <strong>Simple route editing</strong>
            <span>Drag along the hallway like a pencil. Release to save; the app connects the drawn path into the hallway network.</span>
            <div className="tool-row">
              {!routePathMode ? (
                <button className="primary-button" onClick={onStartPathDrawing}>Draw route path</button>
              ) : (
                <>
                  <button className="primary-button active" disabled>Drawing: {routePathDraftCount} points</button>
                  <button className="secondary-button" onClick={onFinishPathDrawing} disabled={routePathDraftCount < 2}>Save drawn path</button>
                  <button className="secondary-button danger" onClick={onCancelPathDrawing}>Cancel</button>
                </>
              )}
            </div>
          </div>
          <div className="tool-row">
            <button className={routeNodeMode ? 'primary-button active' : 'secondary-button'} onClick={() => onStartNodePlacement(nodeType)}>
              {routeNodeMode ? 'Click map for node' : 'Place node on map'}
            </button>
            <button className="secondary-button" onClick={addNode}>Add center node</button>
            <button className="secondary-button" onClick={updateSelectedType} disabled={!selected.length}>Mark selected</button>
            <button className="secondary-button" onClick={snapSelectedToPoi} disabled={selected.length !== 1}>Snap to POI</button>
            <button className="secondary-button" onClick={connectSelected} disabled={selected.length !== 2}>Connect 2</button>
            <button className="secondary-button danger" onClick={deleteSelected} disabled={!selected.length}>Delete selected</button>
          </div>
          <p className="muted">Tip: place 2 hallway nodes in the black hallway path, select both below, then Connect 2. Manual nodes are shown first.</p>
          <div className="route-node-list">
            {visibleNodes.map((node) => (
              <button
                key={node.id}
                className={selected.includes(node.id) ? 'route-node-row active' : 'route-node-row'}
                onClick={() => setSelected((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current.slice(-1), node.id])}
              >
                <strong>{node.name || node.id}</strong>
                <span>{node.type} · {Math.round(node.x)}, {Math.round(node.y)}</span>
              </button>
            ))}
          </div>
          <label>
            Route edges
            <select value={selectedEdgeId} onChange={(event) => setSelectedEdgeId(event.target.value)}>
              <option value="">Choose an edge</option>
              {visibleEdges.map((edge) => {
                const from = graph.nodes?.find((node) => node.id === edge.fromNodeId);
                const to = graph.nodes?.find((node) => node.id === edge.toNodeId);
                return <option key={edge.id} value={edge.id}>{from?.name || edge.fromNodeId} → {to?.name || edge.toNodeId}</option>;
              })}
            </select>
          </label>
          {edgeCount > visibleEdges.length && <p className="muted">Showing editable/manual edges first, plus a small sample of generated edges so the browser stays responsive.</p>}
          <button className="secondary-button danger" onClick={deleteSelectedEdge} disabled={!selectedEdgeId}>Delete edge</button>
          <div className="tool-row">
            <button className="secondary-button" onClick={exportGraph}>Copy graph JSON</button>
            <label className="secondary-button import-graph-button">
              Import graph JSON
              <input type="file" accept="application/json,.json" onChange={importGraph} />
            </label>
          </div>
          {selectedNodes.length > 0 && <p className="muted">Selected: {selectedNodes.map((node) => node.name || node.id).join(' → ')}</p>}
        </div>
      )}
    </section>
  );
}
