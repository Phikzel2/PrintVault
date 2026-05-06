import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED_FOR_THUMBNAIL = {".stl", ".3mf", ".obj"}


def generate_thumbnail(file_path: str, output_path: str) -> bool:
    ext = Path(file_path).suffix.lower()
    if ext not in SUPPORTED_FOR_THUMBNAIL:
        return False

    try:
        import trimesh
        import numpy as np
        from PIL import Image, ImageDraw

        loaded = trimesh.load(file_path)

        if isinstance(loaded, trimesh.Scene):
            geometries = [
                g for g in loaded.geometry.values()
                if isinstance(g, trimesh.Trimesh) and len(g.faces) > 0
            ]
            if not geometries:
                return False
            mesh = trimesh.util.concatenate(geometries) if len(geometries) > 1 else geometries[0]
        elif isinstance(loaded, trimesh.Trimesh):
            mesh = loaded
        else:
            return False

        if len(mesh.faces) == 0:
            return False

        verts = np.array(mesh.vertices, dtype=np.float64)
        faces = np.array(mesh.faces, dtype=np.int32)
        normals = np.array(mesh.face_normals, dtype=np.float64)

        max_faces = 10_000
        if len(faces) > max_faces:
            idx = np.random.choice(len(faces), max_faces, replace=False)
            faces = faces[idx]
            normals = normals[idx]

        # Center and normalize to [-1, 1]
        verts -= verts.mean(axis=0)
        scale = np.abs(verts).max()
        if scale > 0:
            verts /= scale

        # Rotate: 45° azimuth, 25° elevation
        ay, el = np.radians(45), np.radians(25)
        Ry = np.array([[np.cos(ay), 0, np.sin(ay)],
                       [0,          1, 0          ],
                       [-np.sin(ay),0, np.cos(ay) ]])
        Rx = np.array([[1, 0,        0       ],
                       [0, np.cos(el), -np.sin(el)],
                       [0, np.sin(el),  np.cos(el)]])
        R = Rx @ Ry
        verts   = (R @ verts.T).T
        normals = (R @ normals.T).T

        # Orthographic projection to pixel space
        W, H = 400, 300
        sx, sy = W * 0.82 / 2, H * 0.82 / 2
        px = verts[:, 0] * sx + W / 2
        py = -verts[:, 1] * sy + H / 2
        pz = verts[:, 2]

        # Lambertian shading
        light = np.array([0.5, 0.7, 1.0])
        light /= np.linalg.norm(light)
        diffuse = np.clip(normals @ light, 0, 1)
        brightness = 0.25 + 0.75 * diffuse

        # Painter's algorithm: draw back-to-front
        centroid_z = (pz[faces[:, 0]] + pz[faces[:, 1]] + pz[faces[:, 2]]) / 3
        order = np.argsort(centroid_z)

        img = Image.new("RGB", (W, H), (17, 24, 39))
        draw = ImageDraw.Draw(img)
        base = np.array([79.0, 70.0, 229.0])  # #4f46e5

        for fi in order:
            f = faces[fi]
            pts = [(float(px[f[0]]), float(py[f[0]])),
                   (float(px[f[1]]), float(py[f[1]])),
                   (float(px[f[2]]), float(py[f[2]]))]
            b = float(brightness[fi])
            c = (min(255, int(base[0] * b)),
                 min(255, int(base[1] * b)),
                 min(255, int(base[2] * b)))
            draw.polygon(pts, fill=c)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        img.save(output_path, "JPEG", quality=85)
        return True

    except Exception as e:
        logger.warning("Thumbnail generation failed for %s: %s", file_path, e)
        return False
