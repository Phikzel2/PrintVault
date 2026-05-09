from pathlib import Path

FILE_TYPE_MAP: dict[str, str] = {
    ".stl": "STL",
    ".3mf": "3MF",
    ".gcode": "GCODE",
    ".gc": "GCODE",
    ".gco": "GCODE",
    ".obj": "OBJ",
    ".step": "STEP",
    ".stp": "STEP",
    ".amf": "AMF",
}


def detect_file_type(filename: str) -> str:
    return FILE_TYPE_MAP.get(Path(filename).suffix.lower(), "OTHER")
