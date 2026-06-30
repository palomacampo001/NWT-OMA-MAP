import { useMemo, useState } from 'react';

const nodeTypes = ['hallway', 'intersection', 'entrance', 'reception', 'elevator', 'escalator', 'stair', 'destination_snap'];

export default function RouteGraphEditor({ floor, graph, onUpdateGraph }) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [nodeType, setNodeType] = useState('hallway');
  const nodeCount = graph?.nodes?.length || 0;
  const edgeCount = graph?.edges?.length || 0;
  const selectedNodes = useMemo(() => selected.map((id) => graph?.nodes?.find((node) => node.id === id)).filter(Boolean), [selected, graph]);

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
    };
    update((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected([node.id]);
  }

  function connectSelected() {
    if (selected.length !== 2) return;
    const [fromNodeId, toNodeId] = selected;
    update((current) => {
      if (current.edges.some((edge) => [edge.fromNodeId, edge.toNodeId].sort().join('|') === [fromNodeId, toNodeId].sort().join('|'))) return current;
      return {
        ...current,
        edges: [...current.edges, {
          id: `${floor.id}-edge-${Date.now().toString(36)}`,
          floorId: floor.id,
          fromNodeId,
          toNodeId,
          accessible: true,
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
      update(() => ({ floorId: floor.id, nodes: parsed.nodes || [], edges: parsed.edges || [] }));
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
          <label>
            Node type
            <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
              {nodeTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
            </select>
          </label>
          <div className="tool-row">
            <button className="secondary-button" onClick={addNode}>Add node</button>
            <button className="secondary-button" onClick={updateSelectedType} disabled={!selected.length}>Mark selected</button>
            <button className="secondary-button" onClick={snapSelectedToPoi} disabled={selected.length !== 1}>Snap to POI</button>
            <button className="secondary-button" onClick={connectSelected} disabled={selected.length !== 2}>Connect 2</button>
            <button className="secondary-button danger" onClick={deleteSelected} disabled={!selected.length}>Delete selected</button>
          </div>
          <div className="route-node-list">
            {(graph?.nodes || []).slice(0, 80).map((node) => (
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
              {(graph?.edges || []).map((edge) => {
                const from = graph.nodes?.find((node) => node.id === edge.fromNodeId);
                const to = graph.nodes?.find((node) => node.id === edge.toNodeId);
                return <option key={edge.id} value={edge.id}>{from?.name || edge.fromNodeId} → {to?.name || edge.toNodeId}</option>;
              })}
            </select>
          </label>
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
