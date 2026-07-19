import { Contrast, Crosshair, Download, Eraser, Pentagon, Plus, RotateCcw, Settings, Upload, Volume2, VolumeX } from 'lucide-react';
import BrandMark from './BrandMark.jsx';
import EmptyState from './EmptyState.jsx';
import ExportPanel from './ExportPanel.jsx';
import FeatureInspector from './FeatureInspector.jsx';
import FloorSelector from './FloorSelector.jsx';
import IndoorMapViewer from './IndoorMapViewer.jsx';
import RoutePanel from './RoutePanel.jsx';
import SearchPanel from './SearchPanel.jsx';
import SvgUploader from './SvgUploader.jsx';
import NavigationDrawer from './NavigationDrawer.jsx';
import RouteGraphEditor from './RouteGraphEditor.jsx';

export default function AppShell({
  mapData,
  activeFloor,
  activeFloorId,
  selectedFeature,
  selectedId,
  hoveredId,
  highlightId,
  query,
  status,
  addPoiMode,
  areaDrawingMode,
  areaDraftPoints,
  selectedVertexIndex,
  routeNodeMode,
  routePathMode,
  routePathDraftCount,
  locatingMode,
  userLocation,
  locationState,
  startAnchor,
  routeGraphs,
  activeRoute,
  connectorPreference,
  routeDestinationId,
  highContrast,
  voiceGuidance,
  showStartFloorPrompt,
  buildingId,
  adminMode,
  published,
  onUpload,
  onSelectFloor,
  onSelectFeature,
  onHoverFeature,
  onUpdateFeature,
  onAddAreaPoint,
  onStartAreaDrawing,
  onFinishAreaDrawing,
  onUndoAreaPoint,
  onCancelAreaDrawing,
  onUpdateAreaVertex,
  onInsertAreaVertex,
  onSelectAreaVertex,
  onDeleteAreaVertex,
  onDeleteFeature,
  onUpdateRouteGraph,
  onGenerateRouteGraph,
  onStartRoutePathDrawing,
  onFinishRoutePathDrawing,
  onCancelRoutePathDrawing,
  onStartRouteNodePlacement,
  onQueryChange,
  onHighlight,
  onAddPoi,
  onAddRouteNode,
  onAddRoutePathPoint,
  onSetLocation,
  onToggleLocate,
  onChooseStartFloor,
  onDismissStartFloorPrompt,
  onRouteTo,
  onConnectorPreferenceChange,
  onToggleHighContrast,
  onToggleVoiceGuidance,
  onRepeatInstruction,
  onDrainSpeech,
  smartOriginLabel,
  onChangeOrigin,
  onClearRoute,
  onToggleAdmin,
  onPublish,
  onToggleAddPoi,
  onRestoreHidden,
  onCleanupFloor,
  onCleanupAllFloors,
  onLoadSample,
  onClearAll,
}) {
  const hasFloors = mapData.floors.length > 0;

  return (
    <div className={`app-shell ${activeRoute ? 'route-active' : ''} ${adminMode ? 'admin-mode' : 'public-mode'}`}>
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>No Wrong Turns</h1>
            <span>Indoor routing for IBM spaces.</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className={highContrast ? 'ghost-button active' : 'ghost-button'}
            onClick={onToggleHighContrast}
            aria-pressed={highContrast}
            title="Toggle high contrast"
          >
            <Contrast size={17} />
            High contrast
          </button>
          <button
            className={voiceGuidance ? 'ghost-button active' : 'ghost-button'}
            onClick={onToggleVoiceGuidance}
            aria-pressed={voiceGuidance}
            title="Toggle voice guidance"
          >
            {voiceGuidance ? <Volume2 size={17} /> : <VolumeX size={17} />}
            Voice
          </button>
          <button className="ghost-button" onClick={onLoadSample} title="Load sample map">
            <RotateCcw size={17} />
            Sample
          </button>
          <button className={adminMode ? 'primary-button' : 'ghost-button'} onClick={onToggleAdmin} title="Admin">
            <Settings size={17} />
            Admin
          </button>
          <button className="ghost-button danger" onClick={onClearAll} title="Clear app data">
            <Eraser size={17} />
            Clear
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-panel">
          {adminMode && (
            <div className="admin-panel">
              <SvgUploader onUpload={onUpload} status={status} />
              {hasFloors && (
                <button className="primary-button publish-button" onClick={onPublish}>
                  Publish map
                </button>
              )}
              {published && <p className="status success">Map is published for public navigation.</p>}
              <div className="publish-links">
                <a href="/?admin=1">Admin link</a>
                <a href="/" target="_blank" rel="noreferrer">Public link</a>
              </div>
            </div>
          )}
          {hasFloors && (
            <>
              <FloorSelector floors={mapData.floors} activeFloorId={activeFloorId} routeFloorIds={activeRoute?.activeFloorIds || []} onSelectFloor={onSelectFloor} />
              <SearchPanel
                floors={mapData.floors}
                query={query}
                onQueryChange={onQueryChange}
                onSelectFeature={onSelectFeature}
                onHighlight={onHighlight}
                onRouteTo={onRouteTo}
                connectorPreference={connectorPreference}
                onConnectorPreferenceChange={onConnectorPreferenceChange}
                onClearRoute={onClearRoute}
                activeRoute={activeRoute}
              />
              <div className="tool-row">
                {adminMode && <button className={addPoiMode ? 'primary-button active' : 'primary-button'} onClick={onToggleAddPoi}>
                  <Plus size={17} />
                  {addPoiMode ? 'Click map to place POI' : 'Add POI'}
                </button>}
                {adminMode && <button className={areaDrawingMode ? 'primary-button active' : 'secondary-button'} onClick={onStartAreaDrawing}>
                  <Pentagon size={17} />
                  {areaDrawingMode ? 'Drawing area' : 'Add Area'}
                </button>}
                <button className={locatingMode ? 'primary-button active' : 'secondary-button'} onClick={onToggleLocate}>
                  <Crosshair size={17} />
                  {locatingMode ? 'Click your position' : 'Locate me'}
                </button>
                {adminMode && <button className="secondary-button" onClick={onCleanupFloor}>Clean map</button>}
                {adminMode && <button className="secondary-button danger" onClick={onCleanupAllFloors}>Clear corrupted features</button>}
                {adminMode && <button className="secondary-button" onClick={onRestoreHidden}>Restore hidden</button>}
              </div>
              {adminMode && areaDrawingMode && (
                <section className="panel-section area-drawing-panel">
                  <h2><Pentagon size={17} /> Area boundary</h2>
                  <p className="muted">Click the map to add points. Finish when the boundary has at least 3 points.</p>
                  <div className="area-drawing-actions">
                    <button className="primary-button" onClick={onFinishAreaDrawing} disabled={(areaDraftPoints?.length || 0) < 3}>Finish area</button>
                    <button className="secondary-button" onClick={onUndoAreaPoint} disabled={(areaDraftPoints?.length || 0) === 0}>Undo last point</button>
                    <button className="secondary-button danger" onClick={onCancelAreaDrawing}>Cancel</button>
                  </div>
                  <small>{areaDraftPoints?.length || 0} points</small>
                </section>
              )}
              {adminMode && activeFloor?.reviewStats && (
                <section className="panel-section review-panel">
                  <h2>Review</h2>
                  <div className="review-grid">
                    <span>High-confidence rooms</span><strong>{activeFloor.reviewStats.highConfidenceRooms}</strong>
                    <span>Low-confidence rooms</span><strong>{activeFloor.reviewStats.lowConfidenceRooms}</strong>
                    <span>Ignored noise</span><strong>{activeFloor.reviewStats.ignoredNoise}</strong>
                    <span>Hidden corridors</span><strong>{activeFloor.reviewStats.hiddenCorridors}</strong>
                    <span>Labels found</span><strong>{activeFloor.reviewStats.labelsFound}</strong>
                    <span>Manual approvals</span><strong>{activeFloor.reviewStats.manuallyApproved}</strong>
                  </div>
                </section>
              )}
              {adminMode && selectedFeature && (
                <div className="mobile-admin-inspector">
                  <FeatureInspector
                    feature={selectedFeature}
                    floor={activeFloor}
                    selectedVertexIndex={selectedVertexIndex}
                    onUpdateFeature={onUpdateFeature}
                    onDeleteAreaVertex={onDeleteAreaVertex}
                    onDeleteFeature={onDeleteFeature}
                  />
                </div>
              )}
              {adminMode && (
                <RouteGraphEditor
                  floor={activeFloor}
                  graph={routeGraphs?.[activeFloorId]}
                  routeNodeMode={routeNodeMode}
                  routePathMode={routePathMode}
                  routePathDraftCount={routePathDraftCount}
                  onStartNodePlacement={onStartRouteNodePlacement}
                  onStartPathDrawing={onStartRoutePathDrawing}
                  onFinishPathDrawing={onFinishRoutePathDrawing}
                  onCancelPathDrawing={onCancelRoutePathDrawing}
                  onUpdateGraph={(updater) => onUpdateRouteGraph(activeFloorId, updater)}
                  onGenerateGraph={onGenerateRouteGraph}
                />
              )}
              {adminMode && <ExportPanel mapData={mapData} buildingId={buildingId} />}
            </>
          )}
        </aside>

        <section className="map-stage">
          {hasFloors ? (
            <IndoorMapViewer
              floor={activeFloor}
              selectedId={selectedId}
              hoveredId={hoveredId}
              highlightId={highlightId}
              addPoiMode={addPoiMode}
              areaDrawingMode={areaDrawingMode}
              areaDraftPoints={areaDraftPoints}
              selectedVertexIndex={selectedVertexIndex}
              locatingMode={locatingMode}
              routeNodeMode={routeNodeMode}
              routePathMode={routePathMode}
              userLocation={userLocation}
              locationState={locationState}
              startAnchor={startAnchor}
              routeGraph={routeGraphs?.[activeFloorId]}
              activeRoute={activeRoute}
              adminMode={adminMode}
              onSelectFeature={(feature) => onSelectFeature(feature, activeFloor?.id)}
              onHoverFeature={onHoverFeature}
              onAddPoi={onAddPoi}
              onAddRouteNode={onAddRouteNode}
              onAddRoutePathPoint={onAddRoutePathPoint}
              onFinishRoutePathDrawing={onFinishRoutePathDrawing}
              onAddAreaPoint={onAddAreaPoint}
              onUpdateAreaVertex={onUpdateAreaVertex}
              onInsertAreaVertex={onInsertAreaVertex}
              onSelectAreaVertex={onSelectAreaVertex}
              onSetLocation={onSetLocation}
            />
          ) : adminMode ? (
            <EmptyState onUpload={onUpload} onLoadSample={onLoadSample} />
          ) : (
            <div className="public-empty-state">
              <BrandMark />
              <h2>No published map yet</h2>
              <p>Ask the admin to upload SVG floors, review the conversion, and press Publish map.</p>
            </div>
          )}
          <NavigationDrawer
            route={activeRoute}
            activeFloorId={activeFloorId}
            userLocation={userLocation}
            voiceGuidance={voiceGuidance}
            onSelectFloor={onSelectFloor}
            onClearRoute={onClearRoute}
            onToggleLocate={onToggleLocate}
            onToggleVoiceGuidance={onToggleVoiceGuidance}
            onRepeatInstruction={onRepeatInstruction}
            onDrainSpeech={onDrainSpeech}
            smartOriginLabel={smartOriginLabel}
            onChangeOrigin={onChangeOrigin}
          />
          {hasFloors && (
            <div className="floating-controls">
              <FloorSelector compact floors={mapData.floors} activeFloorId={activeFloorId} routeFloorIds={activeRoute?.activeFloorIds || []} onSelectFloor={onSelectFloor} />
              {adminMode && <label className="floating-upload">
                <Upload size={17} />
                <input type="file" accept=".svg,image/svg+xml" multiple onChange={(event) => onUpload(event.target.files)} />
              </label>}
              {adminMode && <a className="floating-download" href="#exports" title="Export">
                <Download size={17} />
              </a>}
            </div>
          )}
        </section>

        <aside className="right-panel">
          {adminMode ? <FeatureInspector
            feature={selectedFeature}
            floor={activeFloor}
            selectedVertexIndex={selectedVertexIndex}
            onUpdateFeature={onUpdateFeature}
            onDeleteAreaVertex={onDeleteAreaVertex}
            onDeleteFeature={onDeleteFeature}
          /> : <RoutePanel
            userLocation={userLocation}
            activeRoute={activeRoute}
            routeDestinationId={routeDestinationId}
            onClearRoute={onClearRoute}
            onToggleLocate={onToggleLocate}
          />}
        </aside>
      </main>
      {showStartFloorPrompt && (
        <section className="start-floor-prompt" role="dialog" aria-modal="true" aria-labelledby="start-floor-title">
          <div className="start-floor-card">
            <div className="start-floor-copy">
              <span className="eyebrow">Before we route</span>
              <h2 id="start-floor-title">What floor are you on?</h2>
              <p>Pick your current floor, then tap your spot on the map. No Wrong Turns will start guidance from there.</p>
            </div>
            <div className="start-floor-grid" aria-label="Choose your current floor">
              {mapData.floors.map((floor) => (
                <button
                  key={floor.id}
                  className={floor.id === activeFloorId ? 'start-floor-button active' : 'start-floor-button'}
                  onClick={() => onChooseStartFloor(floor.id)}
                >
                  {floor.name}
                </button>
              ))}
            </div>
            <div className="start-floor-actions">
              <button className="secondary-button" onClick={onDismissStartFloorPrompt}>I’ll choose later</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
