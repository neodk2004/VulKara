# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Exports a picture made as an example for the app or its docs (Tips & tricks, helper previews, the splash, README
pictures): scaled to at most 768 px, as JPEG, with the EU icon *AI GENERATED* small in its lower right corner (black on
a light corner, white on a dark one). Pictures users make with the app are never labelled this way.

    python tools/example_picture.py <original> <out.jpg> [--max 768] [--label-scale 1.0] [--quality 80]

Keep the originals unlabelled and export from them, so that exporting again does not add a second label.
Needs Pillow (the Diffusers runtime has it).
"""
import argparse
import os

from PIL import Image

ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engines", "diffusers", "eu_ai_label")
# the icon's height as a share of the picture's shorter side: the app's "small" (content_check.LABEL_SIZES)
SHARE = 0.035


def _tone(img, box):
    """black on a light corner, white on a dark one, as the app decides (content_check._label_tone)."""
    corner = img.crop(box).convert("L")
    mean = sum(i * n for i, n in enumerate(corner.histogram())) / max(1, corner.width * corner.height)
    return "black" if mean >= 140 else "white"


def icon_box(w, h, label_scale=1.0):
    """Where the icon goes in a w x h picture: (x, y, width, height)."""
    ih = max(12, round(min(w, h) * SHARE * label_scale))
    with Image.open(os.path.join(ICONS, "generated_black.png")) as probe:
        iw = round(probe.width * ih / probe.height)
    pad = round(ih * 0.6)
    return w - pad - iw, h - pad - ih, iw, ih


def add_label(img, label_scale=1.0):
    """img (RGB) with the icon composited in; a new picture."""
    out = img.convert("RGBA")
    x, y, iw, ih = icon_box(*out.size, label_scale)
    tone = _tone(out, (x, y, x + iw, y + ih))
    with Image.open(os.path.join(ICONS, "generated_%s.png" % tone)) as icon:
        icon = icon.convert("RGBA").resize((iw, ih), Image.LANCZOS)
    out.alpha_composite(icon, (x, y))
    return out.convert("RGB")


def export(src, dst, max_side=768, quality=80, label_scale=1.0):
    """label_scale: a larger icon for pictures shown much smaller than their size (the splash)."""
    img = Image.open(src).convert("RGB")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    add_label(img, label_scale).save(dst, "JPEG", quality=quality, optimize=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max", type=int, default=768)
    ap.add_argument("--label-scale", type=float, default=1.0)
    ap.add_argument("--quality", type=int, default=80)
    a = ap.parse_args()
    export(a.src, a.dst, a.max, quality=a.quality, label_scale=a.label_scale)
