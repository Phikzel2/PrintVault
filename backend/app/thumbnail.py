import io
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
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        import numpy as np

        mesh = trimesh.load(file_path, force="mesh")
        if not hasattr(mesh, "faces") or len(mesh.faces) == 0:
            return False

        vertices = np.array(mesh.vertices)
        faces = np.array(mesh.faces)

        # Subsample for performance on large meshes
        max_faces = 10000
        if len(faces) > max_faces:
            indices = np.random.choice(len(faces), max_faces, replace=False)
            faces = faces[indices]

        # Center and normalize
        center = vertices.mean(axis=0)
        vertices = vertices - center
        scale = np.abs(vertices).max()
        if scale > 0:
            vertices = vertices / scale

        fig = plt.figure(figsize=(4, 3), facecolor="#111827")
        ax = fig.add_subplot(111, projection="3d", facecolor="#111827")

        tri = Poly3DCollection(
            vertices[faces],
            alpha=0.85,
            facecolor="#4f46e5",
            edgecolor="#6366f1",
            linewidth=0.05,
        )
        ax.add_collection3d(tri)

        ax.set_xlim(-1, 1)
        ax.set_ylim(-1, 1)
        ax.set_zlim(-1, 1)
        ax.set_axis_off()
        ax.view_init(elev=20, azim=45)

        plt.tight_layout(pad=0)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        plt.savefig(output_path, dpi=100, bbox_inches="tight", facecolor="#111827", format="jpeg")
        plt.close(fig)
        return True

    except Exception as e:
        logger.warning("Thumbnail generation failed for %s: %s", file_path, e)
        return False
