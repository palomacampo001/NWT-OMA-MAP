#!/usr/bin/env python3
"""Create the Directory Map V2 floor packages from the PDF-derived map data."""

from __future__ import annotations

import json
import math
import re
import shutil
import base64
from datetime import datetime, timezone
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PDF = Path("/Users/palomejaibm/Downloads/260708_IBM_OMA_DI_Directory Map_2-7-8-9-10F.pdf")
SOURCE_MAP_JSON = ROOT / "public" / "directory-map" / "source-published-map.json"
MAP_JSON = ROOT / "public" / "published-map.json"
OUTPUT = ROOT / "public" / "maps" / "directory-v2"
HANDOFF = ROOT / "handoff" / "ibm-oma-directory-map-v2"
SERVER_DB = ROOT / "server" / "data" / "indoor-map-db.json"

ZONE_PALETTE = {
    "zone_a": (142, 181, 203),
    "zone_b": (177, 207, 177),
    "zone_c": (179, 164, 188),
    "zone_d": (204, 163, 170),
    "amenity": (184, 184, 184),
}

CATEGORY_RULES = [
    ("restroom_all_gender", r"all.?gender"),
    ("restroom_accessible", r"accessible toilet"),
    ("restroom_women", r"\bwomen\b"),
    ("restroom_men", r"\bmen\b"),
    ("hydration", r"hydration"),
    ("print_copy", r"copy|print"),
    ("elevator_lobby", r"elevator"),
    ("stairs", r"stair"),
    ("locker_room", r"locker"),
    ("lactation_room", r"lactation"),
    ("meditation_room", r"meditation"),
    ("reflection_room", r"reflection"),
    ("quiet_car", r"quiet car"),
    ("changing_area", r"changing"),
    ("reception", r"reception"),
    ("food_drink", r"blue bar|cafe|café"),
    ("community_hub", r"community hub"),
    ("workstation", r"workstation"),
    ("focus_room", r"\bfocus\b"),
    ("code_box", r"code box"),
    ("open_collab", r"open collab"),
    ("open_presentation", r"open presentation"),
    ("open_brainstorm", r"open brainstorm"),
    ("auditorium", r"auditorium"),
    ("terrace", r"terrace"),
    ("dining", r"dining"),
    ("servery", r"servery"),
    ("training_room", r"training"),
    ("security_office", r"security"),
    ("phone_room", r"phone room"),
    ("mail", r"\bmail\b"),
    ("studio", r"innovation studio|\bstudio\b"),
    ("elt_area", r"elt area"),
    ("think_desk", r"think desk"),
    ("zone", r"^zone [abcd]$"),
    ("office", r"^[abcd]\d{1,3}$"),
]

ICON_BY_CATEGORY = {
    "restroom_all_gender": "toilet",
    "restroom_accessible": "accessibility",
    "restroom_women": "person-standing",
    "restroom_men": "person-standing",
    "hydration": "glass-water",
    "print_copy": "printer",
    "elevator_lobby": "panel-top",
    "stairs": "stairs",
    "locker_room": "archive",
    "food_drink": "coffee",
    "community_hub": "users",
    "auditorium": "presentation",
    "terrace": "trees",
    "dining": "utensils",
    "servery": "utensils",
}

FEATURE_MARGIN = 28


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def floor_body_bounds(source: Path) -> tuple[int, int, int, int]:
    image = Image.open(source).convert("RGB")
    width, height = image.size
    scale = 6
    grid_width = math.ceil(width / scale)
    grid_height = math.ceil(height / scale)
    mask: list[bytearray] = [bytearray(grid_width) for _ in range(grid_height)]
    pixels = image.load()
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
            area = len(cells) * scale * scale
            bounds = (min(xs) * scale, min(ys) * scale, min(width, (max(xs) + 1) * scale), min(height, (max(ys) + 1) * scale))
            bounds_width = bounds[2] - bounds[0]
            bounds_height = bounds[3] - bounds[1]
            if area > 8000 and bounds_width > 35 and bounds_height > 35:
                components.append((area, bounds))

    if not components:
        return (0, 0, width, height)
    min_x = min(bounds[0] for _, bounds in components)
    min_y = min(bounds[1] for _, bounds in components)
    max_x = max(bounds[2] for _, bounds in components)
    max_y = max(bounds[3] for _, bounds in components)
    padding = 20
    return (max(0, min_x - padding), max(0, min_y - padding), min(width, max_x + padding), min(height, max_y + padding))


def clean_background(source: Path, destination: Path, crop_bounds: tuple[int, int, int, int]) -> None:
    image = Image.open(source).convert("RGB")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            # Remove the static yellow PDF marker and yellow street annotations.
            if r > 150 and g > 105 and b < 85 and r > b * 1.8:
                pixels[x, y] = (0, 0, 0)
    image = image.crop(crop_bounds)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)


def classify(name: str) -> str:
    lowered = name.strip().lower()
    for category, pattern in CATEGORY_RULES:
        if re.search(pattern, lowered, re.I):
            return category
    return "custom"


def is_outer_zone_label(feature: dict) -> bool:
    text = (feature.get("displayName") or feature.get("name") or feature.get("roomNumber") or "").strip()
    return bool(re.fullmatch(r"[A-D]", text, re.I))


def transform_feature(feature: dict, crop_bounds: tuple[int, int, int, int]) -> dict | None:
    min_x, min_y, max_x, max_y = crop_bounds
    geometry = feature.get("geometry") or {}
    bbox = feature.get("bbox") or [0, 0, 0, 0]
    if is_outer_zone_label(feature):
        return None
    if geometry.get("type") == "Point":
        x, y = geometry.get("coordinates", [None, None])[:2]
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        if not (min_x - FEATURE_MARGIN <= x <= max_x + FEATURE_MARGIN and min_y - FEATURE_MARGIN <= y <= max_y + FEATURE_MARGIN):
            return None
        next_feature = {**feature}
        next_feature["geometry"] = {"type": "Point", "coordinates": [round(x - min_x, 2), round(y - min_y, 2)]}
        next_feature["bbox"] = [round(bbox[0] - min_x, 2), round(bbox[1] - min_y, 2), bbox[2], bbox[3]] if len(bbox) >= 4 else [round(x - min_x, 2), round(y - min_y, 2), 0, 0]
        return next_feature
    if geometry.get("type") == "Polygon":
        rings = []
        for ring in geometry.get("coordinates", []):
            rings.append([[round(x - min_x, 2), round(y - min_y, 2)] for x, y in ring])
        next_feature = {**feature}
        next_feature["geometry"] = {"type": "Polygon", "coordinates": rings}
        next_feature["bbox"] = [round(bbox[0] - min_x, 2), round(bbox[1] - min_y, 2), bbox[2], bbox[3]] if len(bbox) >= 4 else bbox
        return next_feature
    return None


def transform_graph(graph: dict, crop_bounds: tuple[int, int, int, int]) -> dict:
    min_x, min_y, max_x, max_y = crop_bounds
    nodes = []
    kept = set()
    for node in graph.get("nodes", []):
        x = node.get("x")
        y = node.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        if not (min_x - FEATURE_MARGIN <= x <= max_x + FEATURE_MARGIN and min_y - FEATURE_MARGIN <= y <= max_y + FEATURE_MARGIN):
            continue
        next_node = {**node, "x": round(x - min_x, 2), "y": round(y - min_y, 2)}
        nodes.append(next_node)
        kept.add(node["id"])
    graph = {
        **graph,
        "nodes": nodes,
        "edges": [
            edge for edge in graph.get("edges", [])
            if edge.get("fromNodeId") in kept and edge.get("toNodeId") in kept
        ],
        "cropBounds": [min_x, min_y, max_x, max_y],
    }
    return graph


def point_feature(feature: dict) -> dict | None:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "Point":
        return None
    x, y = geometry["coordinates"][:2]
    name = feature.get("displayName") or feature.get("name") or feature.get("roomNumber")
    if not name or re.fullmatch(r"floor\s+\d+", name, re.I) or "you are here" in name.lower():
        return None
    category = classify(name)
    return {
        "type": "Feature",
        "id": feature["id"],
        "geometry": {"type": "Point", "coordinates": [x, y]},
        "properties": {
            "id": feature["id"],
            "name": name,
            "roomNumber": feature.get("roomNumber") or "",
            "floorId": feature["floorId"],
            "category": category,
            "icon": ICON_BY_CATEGORY.get(category, "map-pin"),
            "searchable": True,
            "accessible": category in {"restroom_accessible", "elevator_lobby"},
            "source": "directory-pdf",
            "confidence": feature.get("confidence", 1),
        },
    }


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a[index] - b[index]) ** 2 for index in range(3)))


def extract_spaces(image_path: Path, floor_id: str) -> list[dict]:
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    scale = 8
    grid_width = math.ceil(width / scale)
    grid_height = math.ceil(height / scale)
    classes: list[list[str | None]] = [[None] * grid_width for _ in range(grid_height)]
    for gy in range(grid_height):
        for gx in range(grid_width):
            pixel = image.getpixel((min(width - 1, gx * scale + scale // 2), min(height - 1, gy * scale + scale // 2)))
            category, distance = min(
                ((name, color_distance(pixel, color)) for name, color in ZONE_PALETTE.items()),
                key=lambda item: item[1],
            )
            if distance < 48:
                classes[gy][gx] = category

    visited: set[tuple[int, int]] = set()
    spaces: list[dict] = []
    for gy in range(grid_height):
        for gx in range(grid_width):
            category = classes[gy][gx]
            if not category or (gx, gy) in visited:
                continue
            queue = deque([(gx, gy)])
            visited.add((gx, gy))
            cells = []
            while queue:
                cx, cy = queue.popleft()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < grid_width and 0 <= ny < grid_height and (nx, ny) not in visited and classes[ny][nx] == category:
                        visited.add((nx, ny))
                        queue.append((nx, ny))
            if len(cells) < 28:
                continue
            min_x = min(cell[0] for cell in cells) * scale
            min_y = min(cell[1] for cell in cells) * scale
            max_x = min(width, (max(cell[0] for cell in cells) + 1) * scale)
            max_y = min(height, (max(cell[1] for cell in cells) + 1) * scale)
            space_id = f"{floor_id}-{category}-{len(spaces) + 1}"
            spaces.append({
                "type": "Feature",
                "id": space_id,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y], [min_x, min_y]]],
                },
                "properties": {
                    "id": space_id,
                    "floorId": floor_id,
                    "name": category.replace("_", " ").title(),
                    "category": category,
                    "source": "directory-pdf-color-segmentation",
                    "editable": True,
                },
            })
    return spaces


def prepare_graph(graph: dict) -> dict:
    removed = {
        node["id"]
        for node in graph.get("nodes", [])
        if "you-are-here" in node.get("id", "") or "you are here" in node.get("name", "").lower()
    }
    graph["nodes"] = [node for node in graph.get("nodes", []) if node["id"] not in removed]
    graph["edges"] = [
        edge for edge in graph.get("edges", [])
        if edge["fromNodeId"] not in removed and edge["toNodeId"] not in removed
    ]
    node_types = {node["id"]: node.get("type", "hallway") for node in graph.get("nodes", [])}
    for edge in graph.get("edges", []):
        endpoint_types = {node_types.get(edge["fromNodeId"]), node_types.get(edge["toNodeId"])}
        stair_edge = "stair" in endpoint_types
        escalator_edge = "escalator" in endpoint_types
        edge["accessible"] = not stair_edge and not escalator_edge
        edge["routeTypes"] = (
            ["standard", "stairs"] if stair_edge
            else ["standard", "escalator"] if escalator_edge
            else ["standard", "accessible", "elevator"]
        )
    graph["status"] = "published"
    graph["version"] = "directory-map-v2"
    return graph


def hallway_geojson(graph: dict) -> dict:
    nodes = {node["id"]: node for node in graph["nodes"]}
    features = []
    for edge in graph["edges"]:
        start = nodes.get(edge["fromNodeId"])
        end = nodes.get(edge["toNodeId"])
        if not start or not end or start["id"] == end["id"]:
            continue
        features.append({
            "type": "Feature",
            "id": edge["id"],
            "geometry": {"type": "LineString", "coordinates": [[start["x"], start["y"]], [end["x"], end["y"]]]},
            "properties": {
                "floorId": graph["floorId"],
                "walkable": True,
                "accessible": edge.get("accessible", True),
                "routeTypes": edge.get("routeTypes", ["standard"]),
                "source": "directory-pdf-black-path",
            },
        })
    return {"type": "FeatureCollection", "features": features}


def build() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    data = json.loads((SOURCE_MAP_JSON if SOURCE_MAP_JSON.exists() else MAP_JSON).read_text())
    data["building"]["id"] = "building-ibm-oma-directory-map-v2"
    data["building"]["name"] = "No Wrong Turns - IBM OMA Directory Map V2"
    data["building"]["description"] = "PDF-derived indoor map with black-path hallway routing."

    extraction_report = {"sourcePdf": str(SOURCE_PDF), "floors": [], "limitations": []}
    for floor in data["floors"]:
        level = str(floor["levelNumber"]).zfill(2)
        floor_dir = OUTPUT / f"floor-{level}"
        source_image = ROOT / "public" / "directory-map" / f"floor-{level}-directory-map.png"
        background = floor_dir / "background.png"
        crop_bounds = floor_body_bounds(source_image)
        clean_background(source_image, background, crop_bounds)
        floor["features"] = [
            transformed
            for feature in floor.get("features", [])
            if (transformed := transform_feature(feature, crop_bounds))
        ]
        cropped_width = crop_bounds[2] - crop_bounds[0]
        cropped_height = crop_bounds[3] - crop_bounds[1]
        floor["viewBox"] = [0, 0, cropped_width, cropped_height]

        pois = [item for feature in floor.get("features", []) if (item := point_feature(feature))]
        labels = [
            {
                "type": "Feature",
                "id": f"label-{poi['id']}",
                "geometry": poi["geometry"],
                "properties": {
                    "name": poi["properties"]["name"],
                    "roomNumber": poi["properties"]["roomNumber"],
                    "floorId": floor["id"],
                    "searchable": True,
                    "source": "directory-pdf",
                },
            }
            for poi in pois
        ]
        spaces = extract_spaces(background, floor["id"])
        graph = prepare_graph(transform_graph(floor["routeGraph"], crop_bounds))

        write_json(floor_dir / "pois.geojson", {"type": "FeatureCollection", "features": pois})
        write_json(floor_dir / "labels.geojson", {"type": "FeatureCollection", "features": labels})
        write_json(floor_dir / "spaces.geojson", {"type": "FeatureCollection", "features": spaces})
        write_json(floor_dir / "hallways.geojson", hallway_geojson(graph))
        write_json(floor_dir / "route-graph.json", graph)
        write_json(floor_dir / "floor.json", {
            "id": floor["id"],
            "name": floor["name"],
            "levelNumber": floor["levelNumber"],
            "viewBox": floor["viewBox"],
            "cropBounds": list(crop_bounds),
            "background": "background.png",
            "spaces": "spaces.geojson",
            "hallways": "hallways.geojson",
            "pois": "pois.geojson",
            "labels": "labels.geojson",
            "routeGraph": "route-graph.json",
            "source": "directory-pdf",
        })

        floor["svgBackgroundUrl"] = f"/maps/directory-v2/floor-{level}/background.png"
        floor["routeGraph"] = graph
        floor["features"] = [
            {
                **feature,
                "category": classify(feature.get("displayName") or feature.get("name") or feature.get("roomNumber") or ""),
                "sourceSvg": {**feature.get("sourceSvg", {}), "source": "directory-pdf-v2"},
            }
            for feature in floor["features"]
            if feature.get("geometry", {}).get("type") == "Point"
            if "you are here" not in (feature.get("displayName") or feature.get("name") or "").lower()
            and not re.fullmatch(r"floor\s+\d+", feature.get("displayName") or feature.get("name") or "", re.I)
        ]
        prepared_spaces = []
        for space in spaces:
            coordinates = space["geometry"]["coordinates"][0]
            xs = [point[0] for point in coordinates]
            ys = [point[1] for point in coordinates]
            properties = space["properties"]
            prepared_spaces.append({
                "id": space["id"],
                "floorId": floor["id"],
                "type": "space",
                "category": properties["category"],
                "name": properties["name"],
                "roomNumber": "",
                "displayName": properties["name"],
                "confidence": 0.78,
                "visible": True,
                "searchable": False,
                "geometry": space["geometry"],
                "bbox": [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)],
                "sourceSvg": {
                    "preparedPackage": True,
                    "source": "directory-pdf-color-segmentation",
                    "editable": True,
                    "manualApproved": False,
                },
                "editable": True,
            })
        floor["features"].extend(prepared_spaces)
        extraction_report["floors"].append({
            "floor": floor["name"],
            "cropBounds": list(crop_bounds),
            "labels": len(labels),
            "pois": len(pois),
            "spaces": len(spaces),
            "routeNodes": len(graph["nodes"]),
            "routeEdges": len(graph["edges"]),
        })

    extraction_report["limitations"] = [
        "Colored space polygons are conservative bounding polygons from color segmentation; irregular room boundaries require admin review.",
        "Repeated generic labels such as Focus, Workstations, Office, and Open remain individually searchable but may need unique display names.",
        "PDF icon classification uses nearby extracted labels and known legend categories; unlabeled icons need admin confirmation.",
        "Indoor positioning still requires user confirmation, a manually selected start point, or future QR anchors.",
    ]
    write_json(OUTPUT / "manifest.json", {
        "id": "ibm-oma-directory-map-v2",
        "sourcePdf": SOURCE_PDF.name,
        "floors": [f"floor-{str(floor['levelNumber']).zfill(2)}/floor.json" for floor in data["floors"]],
    })
    write_json(OUTPUT / "extraction-report.json", extraction_report)
    MAP_JSON.write_text(json.dumps(data, indent=2) + "\n")

    database = json.loads(SERVER_DB.read_text())
    now = datetime.now(timezone.utc).isoformat()
    building_id = data["building"]["id"]
    database["building"] = [{
        "id": building_id,
        "name": data["building"]["name"],
        "address": "IBM OMA",
        "description": data["building"]["description"],
        "createdAt": now,
        "updatedAt": now,
    }]
    for row in database.get("floor", []):
        row["buildingId"] = building_id
    database["mapFeature"] = []
    for floor in data["floors"]:
        for feature in floor["features"]:
            metadata = {
                **feature.get("sourceSvg", {}),
                "isDefaultStart": False,
                "searchable": feature.get("searchable", True),
            }
            database["mapFeature"].append({
                "id": feature["id"],
                "buildingId": building_id,
                "floorId": floor["id"],
                "sourceSvgId": None,
                "type": feature.get("type", "poi"),
                "category": feature.get("category", "custom"),
                "name": feature.get("name", ""),
                "displayName": feature.get("displayName", feature.get("name", "")),
                "roomNumber": feature.get("roomNumber", ""),
                "geometryJson": json.dumps(feature["geometry"]),
                "bboxJson": json.dumps(feature.get("bbox", [0, 0, 0, 0])),
                "confidence": feature.get("confidence", 1),
                "visible": feature.get("visible", True),
                "isDeleted": False,
                "sourceMetadataJson": json.dumps(metadata),
                "createdAt": now,
                "updatedAt": now,
            })
    database["routeNode"] = [node for floor in data["floors"] for node in floor["routeGraph"]["nodes"]]
    database["routeEdge"] = [edge for floor in data["floors"] for edge in floor["routeGraph"]["edges"]]
    source_floor_ids = {
        row.get("svgFileId"): row.get("id")
        for row in database.get("floor", [])
        if row.get("svgFileId")
    }
    for uploaded in database.get("uploadedFile", []):
        floor_id = source_floor_ids.get(uploaded.get("id"))
        floor = next((item for item in data["floors"] if item["id"] == floor_id), None)
        if not floor:
            continue
        level = str(floor["levelNumber"]).zfill(2)
        image_bytes = (OUTPUT / f"floor-{level}" / "background.png").read_bytes()
        encoded = base64.b64encode(image_bytes).decode("ascii")
        view_width = floor["viewBox"][2]
        view_height = floor["viewBox"][3]
        uploaded["buildingId"] = building_id
        uploaded["originalFilename"] = f"floor-{level}-directory-v2.svg"
        uploaded["rawText"] = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_width} {view_height}">'
            f'<image width="{view_width}" height="{view_height}" href="data:image/png;base64,{encoded}"/></svg>'
        )
        uploaded["updatedAt"] = now
    snapshot = json.dumps(data, separators=(",", ":"))
    database["mapVersion"] = [{
        "id": "map-version-directory-v2",
        "buildingId": building_id,
        "versionName": "Directory Map V2",
        "status": "published",
        "snapshotJson": snapshot,
        "publishedAt": now,
        "createdAt": now,
        "updatedAt": now,
    }]
    SERVER_DB.write_text(json.dumps(database, indent=2) + "\n")

    HANDOFF.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_PDF, HANDOFF / SOURCE_PDF.name)
    if (HANDOFF / "public-maps").exists():
        shutil.rmtree(HANDOFF / "public-maps")
    shutil.copytree(OUTPUT, HANDOFF / "public-maps")
    shutil.copy2(ROOT / "scripts" / "generate_directory_route_graphs.py", HANDOFF / "generate_directory_route_graphs.py")
    shutil.copy2(Path(__file__), HANDOFF / "build_directory_v2.py")
    write_json(HANDOFF / "published-map.json", data)


if __name__ == "__main__":
    build()
