#!/usr/bin/env python3
"""Build route graphs from the black circulation areas in directory-map PNGs."""

from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_MAP = ROOT / "public" / "published-map.json"
SERVER_DB = ROOT / "server" / "data" / "indoor-map-db.json"
IMAGE_DIR = ROOT / "public" / "directory-map"
GRID_STEP = 28
BLACK_LIMIT = 42


def black_mask(image: Image.Image) -> tuple[list[bytearray], int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    mask = [bytearray(width) for _ in range(height)]
    for y in range(height):
        row = mask[y]
        for x in range(width):
            r, g, b = pixels[x, y]
            row[x] = int(max(r, g, b) < BLACK_LIMIT)
    return mask, width, height


def bounded_black(mask: list[bytearray], image: Image.Image, width: int, height: int) -> list[bytearray]:
    """Keep black cells enclosed by the colored/white floor geometry."""
    rgb = image.convert("RGB")
    pixels = rgb.load()
    structural = [bytearray(width) for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            structural[y][x] = int(max(r, g, b) > 78)

    row_bounds = []
    for y in range(height):
        occupied = [x for x in range(width) if structural[y][x]]
        row_bounds.append((min(occupied), max(occupied)) if occupied else None)
    column_bounds = []
    for x in range(width):
        occupied = [y for y in range(height) if structural[y][x]]
        column_bounds.append((min(occupied), max(occupied)) if occupied else None)

    result = [bytearray(width) for _ in range(height)]
    for y in range(height):
        row = row_bounds[y]
        for x in range(width):
            column = column_bounds[x]
            if not mask[y][x] or not row or not column:
                continue
            horizontal = row[0] + 4 < x < row[1] - 4
            vertical = column[0] + 4 < y < column[1] - 4
            result[y][x] = int(horizontal and vertical)
    return result


def mostly_walkable(interior: list[bytearray], x: int, y: int, radius: int = 8) -> bool:
    height = len(interior)
    width = len(interior[0])
    x0, x1 = max(0, x - radius), min(width, x + radius + 1)
    y0, y1 = max(0, y - radius), min(height, y + radius + 1)
    total = (x1 - x0) * (y1 - y0)
    filled = sum(sum(interior[row][x0:x1]) for row in range(y0, y1))
    return filled / max(1, total) >= 0.82


def line_is_walkable(interior: list[bytearray], a: tuple[int, int], b: tuple[int, int]) -> bool:
    distance = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
    for index in range(distance + 1):
        amount = index / max(1, distance)
        x = round(a[0] + (b[0] - a[0]) * amount)
        y = round(a[1] + (b[1] - a[1]) * amount)
        if not mostly_walkable(interior, x, y, 5):
            return False
    return True


def feature_point(feature: dict) -> tuple[float, float] | None:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") == "Point":
        x, y = geometry.get("coordinates", [None, None])[:2]
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            return float(x), float(y)
    bbox = feature.get("bbox")
    if bbox and len(bbox) >= 4:
        return bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2
    return None


def nearest_node(point: tuple[float, float], nodes: list[dict]) -> dict:
    return min(nodes, key=lambda node: math.hypot(node["x"] - point[0], node["y"] - point[1]))


def keep_largest_connected_hallway(nodes: list[dict], edges: list[dict]) -> tuple[list[dict], list[dict]]:
    by_id = {node["id"]: node for node in nodes}
    adjacency = {node_id: [] for node_id in by_id}
    for edge in edges:
        if edge["fromNodeId"] in adjacency and edge["toNodeId"] in adjacency:
            adjacency[edge["fromNodeId"]].append(edge["toNodeId"])
            adjacency[edge["toNodeId"]].append(edge["fromNodeId"])
    unseen = set(adjacency)
    components: list[set[str]] = []
    while unseen:
        start = unseen.pop()
        component = {start}
        queue = [start]
        while queue:
            current = queue.pop()
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.add(neighbor)
                    queue.append(neighbor)
        components.append(component)
    keep = max(components, key=len) if components else set()
    return (
        [node for node in nodes if node["id"] in keep],
        [edge for edge in edges if edge["fromNodeId"] in keep and edge["toNodeId"] in keep],
    )


def graph_for_floor(floor: dict) -> dict:
    level = str(floor["levelNumber"]).zfill(2)
    image_path = IMAGE_DIR / f"floor-{level}-directory-map.png"
    image = Image.open(image_path)
    raw_mask, width, height = black_mask(image)
    interior = bounded_black(raw_mask, image, width, height)

    grid: dict[tuple[int, int], dict] = {}
    nodes: list[dict] = []
    edges: list[dict] = []
    floor_id = floor["id"]
    for y in range(GRID_STEP // 2, height, GRID_STEP):
        for x in range(GRID_STEP // 2, width, GRID_STEP):
            if not mostly_walkable(interior, x, y):
                continue
            node = {
                "id": f"{floor_id}-hall-{len(nodes) + 1}",
                "floorId": floor_id,
                "x": x,
                "y": y,
                "type": "hallway",
                "name": "Hallway",
                "source": "directory-map-black-circulation",
            }
            grid[(x, y)] = node
            nodes.append(node)

    for (x, y), node in grid.items():
        for dx, dy in ((GRID_STEP, 0), (0, GRID_STEP), (GRID_STEP, GRID_STEP), (-GRID_STEP, GRID_STEP)):
            other = grid.get((x + dx, y + dy))
            if not other or not line_is_walkable(interior, (x, y), (x + dx, y + dy)):
                continue
            edges.append({
                "id": f"{floor_id}-hall-edge-{len(edges) + 1}",
                "floorId": floor_id,
                "fromNodeId": node["id"],
                "toNodeId": other["id"],
                "distance": round(math.hypot(dx, dy), 2),
                "accessible": True,
                "source": "directory-map-black-circulation",
            })

    if not nodes:
        raise RuntimeError(f"No interior black hallway pixels found for {floor_id}")

    nodes, edges = keep_largest_connected_hallway(nodes, edges)

    for feature in floor.get("features", []):
        if feature.get("visible") is False:
            continue
        point = feature_point(feature)
        if not point:
            continue
        closest = nearest_node(point, nodes)
        category = str(feature.get("category", "")).lower()
        if "elevator" in category:
            node_type = "elevator"
        elif "stair" in category:
            node_type = "stair"
        elif "escalator" in category:
            node_type = "escalator"
        elif feature.get("isDefaultStart"):
            node_type = "entrance"
        else:
            node_type = "destination_approach"
        approach = {
            "id": f"{floor_id}-approach-{feature['id']}",
            "floorId": floor_id,
            "x": closest["x"],
            "y": closest["y"],
            "type": node_type,
            "name": feature.get("displayName") or feature.get("name") or "Destination",
            "linkedPoiId": feature["id"],
            "linkedFeatureId": feature["id"],
            "connectorGroupId": "OMA-ELEVATOR-CORE" if node_type == "elevator" else "",
            "source": "directory-map-destination-snap",
        }
        nodes.append(approach)
        edges.append({
            "id": f"{floor_id}-approach-edge-{feature['id']}",
            "floorId": floor_id,
            "fromNodeId": approach["id"],
            "toNodeId": closest["id"],
            "distance": 1,
            "accessible": True,
            "source": "directory-map-destination-snap",
        })

    return {
        "floorId": floor_id,
        "status": "published",
        "version": "directory-black-hallways-v1",
        "nodes": nodes,
        "edges": edges,
    }


def update_map(map_data: dict) -> dict:
    for floor in map_data.get("floors", []):
        if not floor.get("id", "").startswith("floor-directory-"):
            continue
        floor["routeGraph"] = graph_for_floor(floor)
        print(f"{floor['name']}: {len(floor['routeGraph']['nodes'])} nodes, {len(floor['routeGraph']['edges'])} edges")
    return map_data


def main() -> None:
    public_data = update_map(json.loads(PUBLIC_MAP.read_text()))
    PUBLIC_MAP.write_text(json.dumps(public_data, indent=2) + "\n")

    database = json.loads(SERVER_DB.read_text())
    published_json = json.dumps(public_data, separators=(",", ":"))
    for version in database.get("mapVersion", []):
        if version.get("status") == "published":
            version["snapshotJson"] = published_json
    database["routeNode"] = [
        node
        for floor in public_data["floors"]
        for node in floor.get("routeGraph", {}).get("nodes", [])
    ]
    database["routeEdge"] = [
        edge
        for floor in public_data["floors"]
        for edge in floor.get("routeGraph", {}).get("edges", [])
    ]
    SERVER_DB.write_text(json.dumps(database, indent=2) + "\n")


if __name__ == "__main__":
    main()
