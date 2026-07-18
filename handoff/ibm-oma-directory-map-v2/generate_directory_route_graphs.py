#!/usr/bin/env python3
"""Build route graphs from the black circulation areas in directory-map PNGs."""

from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MAP = ROOT / "public" / "directory-map" / "source-published-map.json"
PUBLIC_MAP = ROOT / "public" / "published-map.json"
IMAGE_DIR = ROOT / "public" / "directory-map"
GRID_STEP = 28
BLACK_LIMIT = 42
FEATURE_MARGIN = 28


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


def floor_body_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    scale = 6
    grid_width = math.ceil(width / scale)
    grid_height = math.ceil(height / scale)
    mask = [bytearray(grid_width) for _ in range(grid_height)]
    for gy in range(grid_height):
        for gx in range(grid_width):
            x0, y0 = gx * scale, gy * scale
            x1, y1 = min(width, x0 + scale), min(height, y0 + scale)
            total = (x1 - x0) * (y1 - y0)
            filled = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    r, g, b = pixels[x, y]
                    if max(r, g, b) > 70 and not (r > 120 and g > 80 and b < 80 and r > b * 1.5):
                        filled += 1
            if filled / max(1, total) > 0.18:
                mask[gy][gx] = 1

    visited: set[tuple[int, int]] = set()
    components: list[tuple[int, tuple[int, int, int, int]]] = []
    for gy in range(grid_height):
        for gx in range(grid_width):
            if not mask[gy][gx] or (gx, gy) in visited:
                continue
            queue = deque([(gx, gy)])
            visited.add((gx, gy))
            cells = []
            while queue:
                cx, cy = queue.popleft()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < grid_width and 0 <= ny < grid_height and mask[ny][nx] and (nx, ny) not in visited:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
            xs = [cell[0] for cell in cells]
            ys = [cell[1] for cell in cells]
            bounds = (min(xs) * scale, min(ys) * scale, min(width, (max(xs) + 1) * scale), min(height, (max(ys) + 1) * scale))
            area = len(cells) * scale * scale
            if area > 8000 and bounds[2] - bounds[0] > 35 and bounds[3] - bounds[1] > 35:
                components.append((area, bounds))
    if not components:
        return (0, 0, width, height)
    min_x = min(bounds[0] for _, bounds in components)
    min_y = min(bounds[1] for _, bounds in components)
    max_x = max(bounds[2] for _, bounds in components)
    max_y = max(bounds[3] for _, bounds in components)
    padding = 20
    return (max(0, min_x - padding), max(0, min_y - padding), min(width, max_x + padding), min(height, max_y + padding))


def constrain_mask_to_bounds(mask: list[bytearray], bounds: tuple[int, int, int, int]) -> list[bytearray]:
    min_x, min_y, max_x, max_y = bounds
    height = len(mask)
    width = len(mask[0])
    result = [bytearray(width) for _ in range(height)]
    for y in range(max(0, min_y), min(height, max_y)):
        source = mask[y]
        result[y][max(0, min_x):min(width, max_x)] = source[max(0, min_x):min(width, max_x)]
    return result


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
    body_bounds = floor_body_bounds(image)
    raw_mask, width, height = black_mask(image)
    interior = constrain_mask_to_bounds(bounded_black(raw_mask, image, width, height), body_bounds)

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
        if not (
            body_bounds[0] - FEATURE_MARGIN <= point[0] <= body_bounds[2] + FEATURE_MARGIN
            and body_bounds[1] - FEATURE_MARGIN <= point[1] <= body_bounds[3] + FEATURE_MARGIN
        ):
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
        "cropBounds": list(body_bounds),
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
    source_path = SOURCE_MAP if SOURCE_MAP.exists() else PUBLIC_MAP
    public_data = update_map(json.loads(source_path.read_text()))
    source_path.write_text(json.dumps(public_data, indent=2) + "\n")


if __name__ == "__main__":
    main()
