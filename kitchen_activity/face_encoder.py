"""
face_encoder.py — Employee face registration and recognition helper.

Directory layout expected by DeepFace:
    faces_db/
        홍길동/
            01.jpg
            02.jpg
        김철수/
            01.jpg

CLI usage:
    python -m kitchen_activity.face_encoder --name "홍길동" --image photo.jpg
    python -m kitchen_activity.face_encoder --list
    python -m kitchen_activity.face_encoder --delete "홍길동"
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import cv2
import numpy as np


# ── DB helpers ────────────────────────────────────────────────────────────────

def _clear_repr_cache(db_path: Path) -> None:
    """Delete DeepFace's pre-built pickle cache so next find() rebuilds it."""
    for pkl in db_path.rglob("representations_*.pkl"):
        pkl.unlink(missing_ok=True)


def register_face(faces_db: str, name: str, image_path: str) -> Path:
    """
    Copy *image_path* into faces_db/<name>/ and return the destination path.
    Clears DeepFace representation cache so changes take effect immediately.
    """
    db = Path(faces_db)
    emp_dir = db / name
    emp_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(emp_dir.glob("*.jpg")) + sorted(emp_dir.glob("*.png"))
    idx = len(existing) + 1
    ext = Path(image_path).suffix.lower() or ".jpg"
    dest = emp_dir / f"{idx:02d}{ext}"
    shutil.copy2(image_path, dest)

    _clear_repr_cache(db)
    return dest


def register_face_bytes(faces_db: str, name: str, image_bytes: bytes, ext: str = ".jpg") -> Path:
    """Save raw image bytes (from an upload) as a new face photo."""
    db = Path(faces_db)
    emp_dir = db / name
    emp_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(emp_dir.glob("*.jpg")) + sorted(emp_dir.glob("*.png"))
    idx = len(existing) + 1
    dest = emp_dir / f"{idx:02d}{ext.lstrip('.')}"
    dest.write_bytes(image_bytes)

    _clear_repr_cache(db)
    return dest


def delete_employee(faces_db: str, name: str) -> bool:
    emp_dir = Path(faces_db) / name
    if emp_dir.exists():
        shutil.rmtree(emp_dir)
        _clear_repr_cache(Path(faces_db))
        return True
    return False


def list_employees(faces_db: str) -> list[dict]:
    """Return list of {name, photo_count} dicts sorted by name."""
    db = Path(faces_db)
    if not db.exists():
        return []
    result = []
    for p in sorted(db.iterdir()):
        if p.is_dir():
            photos = list(p.glob("*.jpg")) + list(p.glob("*.png"))
            result.append({"name": p.name, "photo_count": len(photos)})
    return result


# ── Recognition ───────────────────────────────────────────────────────────────

def recognize(
    crop_bgr: np.ndarray,
    faces_db: str,
    model_name: str = "SFace",
    distance_threshold: float = 0.6,
) -> str:
    """
    Run DeepFace.find() on a face crop (BGR numpy array).
    Returns the matched employee name or 'unknown'.

    Model recommendations:
        SFace       — fastest, no TensorFlow required (uses OpenCV DNN)
        Facenet512  — more accurate, requires tensorflow
        ArcFace     — balanced, requires tensorflow
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return "unknown"

    db = Path(faces_db)
    if not db.exists():
        return "unknown"

    # Skip if no employee directories exist
    has_any = any(p.is_dir() for p in db.iterdir()) if db.exists() else False
    if not has_any:
        return "unknown"

    try:
        from deepface import DeepFace  # noqa: PLC0415  (lazy: heavy import)

        results = DeepFace.find(
            img_path=crop_bgr,
            db_path=str(db),
            model_name=model_name,
            distance_metric="cosine",
            enforce_detection=False,
            silent=True,
        )

        if not results or results[0].empty:
            return "unknown"

        best_row = results[0].iloc[0]

        # Column name is like "distance" or "<model>_cosine"
        dist_cols = [c for c in best_row.index if "distance" in c.lower()]
        if not dist_cols:
            return "unknown"

        dist = float(best_row[dist_cols[0]])
        if dist > distance_threshold:
            return "unknown"

        # Identity format: faces_db/<employee_name>/<photo.jpg>
        matched_path = Path(str(best_row["identity"]))
        return matched_path.parent.name

    except Exception as exc:  # noqa: BLE001
        print(f"[FaceRecog] error: {exc}")
        return "unknown"


# ── CLI ───────────────────────────────────────────────────────────────────────

def _main() -> None:
    parser = argparse.ArgumentParser(description="Employee face DB manager")
    parser.add_argument("--db", default="faces_db", help="Path to faces_db directory")
    sub = parser.add_subparsers(dest="cmd")

    reg = sub.add_parser("register", help="Register a new face photo")
    reg.add_argument("--name", required=True, help="Employee name (Korean OK)")
    reg.add_argument("--image", required=True, help="Path to face image file")

    sub.add_parser("list", help="List registered employees")

    del_p = sub.add_parser("delete", help="Delete an employee from the DB")
    del_p.add_argument("--name", required=True)

    args = parser.parse_args()

    if args.cmd == "register":
        dest = register_face(args.db, args.name, args.image)
        print(f"✓ Registered {args.name} → {dest}")

    elif args.cmd == "list":
        employees = list_employees(args.db)
        if not employees:
            print("No employees registered yet.")
        else:
            print(f"{'Name':<20} {'Photos':>6}")
            print("-" * 28)
            for e in employees:
                print(f"{e['name']:<20} {e['photo_count']:>6}")

    elif args.cmd == "delete":
        ok = delete_employee(args.db, args.name)
        print(f"{'✓ Deleted' if ok else '✗ Not found'}: {args.name}")

    else:
        parser.print_help()


if __name__ == "__main__":
    _main()
