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
        from PIL import Image

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

        # Drop degenerate faces with invalid normals
        valid = np.all(np.isfinite(normals), axis=1)
        faces, normals = faces[valid], normals[valid]
        if len(faces) == 0:
            return False

        # Center and normalize to [-1, 1]
        verts -= verts.mean(axis=0)
        scale = np.abs(verts).max()
        if scale > 0:
            verts /= scale

        # Camera rotation: 45° azimuth, 25° elevation
        ay, el = np.radians(45), np.radians(25)
        Ry = np.array([[np.cos(ay), 0, np.sin(ay)],
                       [0,          1, 0           ],
                       [-np.sin(ay),0, np.cos(ay)  ]])
        Rx = np.array([[1, 0,           0          ],
                       [0, np.cos(el), -np.sin(el) ],
                       [0, np.sin(el),  np.cos(el) ]])
        R = Rx @ Ry
        verts   = (R @ verts.T).T
        normals = (R @ normals.T).T

        # Back-face culling: skip faces whose normal points away from camera (+Z axis)
        front = normals[:, 2] > 0
        faces, normals = faces[front], normals[front]
        if len(faces) == 0:
            return False

        # Orthographic projection — uniform scale so model isn't squished
        W, H = 400, 300
        s = min(W, H) * 0.82 / 2
        px = verts[:, 0] * s + W / 2
        py = -verts[:, 1] * s + H / 2
        pz = verts[:, 2]

        # Lambertian shading per face
        light = np.array([0.5, 0.7, 1.0])
        light /= np.linalg.norm(light)
        diffuse = np.clip(normals @ light, 0, 1)
        brightness = np.nan_to_num(0.35 + 0.65 * diffuse, nan=0.5)

        # Z-buffer: for each pixel keep the colour of the nearest (highest z) face
        zbuf    = np.full((H, W), -np.inf, dtype=np.float64)
        img_arr = np.full((H, W, 3), (17, 24, 39), dtype=np.uint8)
        base    = np.array([79.0, 70.0, 229.0])  # #4f46e5

        for fi in range(len(faces)):
            f = faces[fi]
            x0, y0, z0 = px[f[0]], py[f[0]], pz[f[0]]
            x1, y1, z1 = px[f[1]], py[f[1]], pz[f[1]]
            x2, y2, z2 = px[f[2]], py[f[2]], pz[f[2]]

            # Skip faces that are sub-pixel in screen space
            if abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) < 0.5:
                continue

            xmin = max(0,     int(np.floor(min(x0, x1, x2))))
            xmax = min(W - 1, int(np.ceil( max(x0, x1, x2))))
            ymin = max(0,     int(np.floor(min(y0, y1, y2))))
            ymax = min(H - 1, int(np.ceil( max(y0, y1, y2))))
            if xmin > xmax or ymin > ymax:
                continue

            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 1e-10:
                continue

            # Pixel centres in bounding box
            xs = np.arange(xmin, xmax + 1, dtype=np.float64) + 0.5
            ys = np.arange(ymin, ymax + 1, dtype=np.float64) + 0.5
            gx, gy = np.meshgrid(xs, ys)

            # Barycentric coordinates
            w0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / denom
            w1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / denom
            w2 = 1.0 - w0 - w1

            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any():
                continue

            z_face = w0 * z0 + w1 * z1 + w2 * z2
            cur_z  = zbuf[ymin:ymax + 1, xmin:xmax + 1]
            update = inside & (z_face > cur_z)
            if not update.any():
                continue

            color = np.clip(base * float(brightness[fi]), 0, 255).astype(np.uint8)
            zbuf   [ymin:ymax + 1, xmin:xmax + 1][update] = z_face[update]
            img_arr[ymin:ymax + 1, xmin:xmax + 1][update] = color

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        Image.fromarray(img_arr, "RGB").save(output_path, "JPEG", quality=85)
        return True

    except Exception as e:
        logger.warning("Thumbnail generation failed for %s: %s", file_path, e)
        return False
