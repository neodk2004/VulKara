# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Shared by the LoRA trainers (diffusers/train_sdxl.py, mlx/train.py): the job's
pictures and captions, the progress protocol and storing the result like an imported LoRA."""
import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path

import registry

LORA_MANIFEST = "lora.json"
PREVIEW = "preview.jpg"
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def emit(obj):
    """one progress line for the app: phase/step/total/loss/eta_s, message, done or error"""
    print("__train__ " + json.dumps(obj), flush=True)


def safe_name(name):
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", str(name or "")).strip("._")
    name = re.sub(r"\.\.+", "_", name)
    if not name:
        raise ValueError("Invalid name")
    return name


def caption_for(item, trigger):
    """the trigger word leads every caption, so the LoRA ties what it learns to it"""
    caption = (item.get("caption") or "").strip()
    if trigger and trigger.lower() not in caption.lower():
        caption = trigger + (", " + caption if caption else "")
    return caption or "a photo"


def prepare_images(job, data_dir, resolution):
    """Copies the pictures (upright, RGB, at most 1.5 x the training size) with a .txt caption each."""
    from PIL import Image, ImageOps
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for i, item in enumerate(job["images"]):
        if not str(item.get("path", "")).lower().endswith(IMAGE_EXTS) or not os.path.isfile(item["path"]):
            continue
        im = ImageOps.exif_transpose(Image.open(item["path"])).convert("RGB")
        limit = int(resolution * 1.5)
        if max(im.size) > limit:
            s = limit / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(data_dir / ("img%03d.png" % i))
        (data_dir / ("img%03d.txt" % i)).write_text(caption_for(item, job.get("trigger", "")), encoding="utf-8")
        n += 1
    if n == 0:
        raise ValueError("No pictures to train on")
    return n


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _preview_from(image_path, folder, size=384):
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
    s = size / min(im.size)
    im = im.resize((max(size, round(im.width * s)), max(size, round(im.height * s))), Image.LANCZOS)
    left, top = (im.width - size) // 2, (im.height - size) // 2
    im.crop((left, top, left + size, top + size)).save(os.path.join(folder, PREVIEW), quality=85)


def write_lora_folder(job, adapter_path, family, base, training, variant=None):
    """<loras_dir>/<name>/ with lora.safetensors and lora.json, as the importer writes it; the
    picture is the first training picture. Returns the folder."""
    root = Path(job["loras_dir"])
    root.mkdir(parents=True, exist_ok=True)
    name = safe_name(job["name"])
    target, i = root / name, 2
    while target.exists():
        target, i = root / ("%s_%d" % (name, i)), i + 1
    target.mkdir()
    dst = target / "lora.safetensors"
    shutil.copy(adapter_path, dst)
    shapes = registry.read_safetensors_header(str(dst))
    trigger = (job.get("trigger") or "").strip()
    manifest = {
        "type": "lora", "format_version": 1, "name": target.name, "file": dst.name, "sha256": _sha256(dst),
        "source": {"type": "trained", "ref": None, "file": None}, "imported_at": int(time.time()),
        "family": family, "base": base, "trigger_words": [trigger] if trigger else [],
        "trigger_words_source": "user", "params_m": round(registry._n_params(shapes) / 1e6, 1),
        "training": dict(training, trained_at=int(time.time())),
    }
    if variant:
        manifest["variant"] = variant  # trained on FLUX.2 [klein] 4B fits that one only
    first = next((it["path"] for it in job["images"] if os.path.isfile(it.get("path", ""))), None)
    if first:
        try:
            _preview_from(first, target)
            manifest["preview"], manifest["preview_source"] = PREVIEW, "training"
        except Exception:
            pass
    with open(target / LORA_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1)
    return str(target)
