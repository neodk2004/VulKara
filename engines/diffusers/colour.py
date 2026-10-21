# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Pictures read as sRGB, whatever profile they carry. The engines work on plain sRGB values; a picture with another
profile (Display P3, Adobe RGB, or an HDR one like Rec. 2020 PQ that some upscalers and iPhones write) would else be
read with wrong tones: flat and grey (PQ keeps paper white at about 58 % of its range), its colours shifted, and the
result saved without the profile looks worse than the input.

HDR profiles (PQ, HLG) are decoded by hand: LittleCMS maps PQ by absolute brightness, which leaves white grey; here
paper white is the reference white of BT.2408 (203 cd/m²), brighter highlights are compressed softly."""
import io

import numpy as np
from PIL import Image, ImageOps

SDR_WHITE = 203.0  # cd/m², BT.2408 reference white
# Rec. 2020 -> sRGB (BT.709) primaries, linear light
BT2020_TO_709 = np.array([[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]])


def profile_name(img):
    """The description of the picture's embedded profile, or ''."""
    icc = img.info.get("icc_profile")
    if not icc:
        return ""
    try:
        from PIL import ImageCms
        return ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip()
    except Exception:
        return ""


def _hdr_kind(name):
    n = name.lower()
    if "pq" in n.split() or "st 2084" in n or "smpte 2084" in n or n.endswith(" pq"):
        return "pq"
    if "hlg" in n:
        return "hlg"
    return None


def _pq_to_linear(e):
    """PQ (SMPTE ST 2084) code values 0..1 -> linear light relative to paper white."""
    m1, m2 = 2610 / 16384, 2523 / 4096 * 128
    c1, c2, c3 = 3424 / 4096, 2413 / 4096 * 32, 2392 / 4096 * 32
    p = np.power(np.clip(e, 0, 1), 1 / m2)
    return np.power(np.maximum(p - c1, 0) / (c2 - c3 * p), 1 / m1) * 10000.0 / SDR_WHITE


def _hlg_to_linear(e):
    """HLG (BT.2100) code values 0..1 -> scene light, scaled so 75 % HLG (paper white) is 1."""
    a, b, c = 0.17883277, 0.28466892, 0.55991073
    e = np.clip(e, 0, 1)
    lin = np.where(e <= 0.5, e * e / 3, (np.exp((e - c) / a) + b) / 12)
    return lin / 0.26496256  # HLG 75 % -> 0.265 scene light


def _to_srgb8(lin):
    """Linear Rec.709 light (1 = paper white) -> sRGB bytes; highlights above white are compressed, not clipped."""
    lin = np.maximum(lin, 0)
    knee = 0.9
    over = lin > knee
    lin = lin.copy()
    lin[over] = knee + (1 - knee) * (1 - np.exp(-(lin[over] - knee) / (1 - knee)))
    s = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    return (np.clip(s, 0, 1) * 255).round().astype(np.uint8)


def to_srgb(img):
    """An RGB picture in sRGB: converted from its embedded profile (HDR ones by hand), unchanged without one."""
    name = profile_name(img)
    rgb = img.convert("RGB") if img.mode not in ("RGB",) else img
    if not name:
        return rgb
    kind = _hdr_kind(name)
    if kind:
        e = np.asarray(rgb).astype(np.float64) / 255.0
        lin = _pq_to_linear(e) if kind == "pq" else _hlg_to_linear(e)
        if "2020" in name or "2100" in name:
            lin = lin @ BT2020_TO_709.T
        return Image.fromarray(_to_srgb8(lin))
    if "srgb" in name.lower():
        return rgb
    try:
        from PIL import ImageCms
        src = ImageCms.ImageCmsProfile(io.BytesIO(img.info["icc_profile"]))
        out = ImageCms.profileToProfile(img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img, src,
                                        ImageCms.createProfile("sRGB"), renderingIntent=0, outputMode="RGB")
        return out if out is not None else rgb
    except Exception:  # a broken profile: the values as they are
        return rgb


def open_rgb(path):
    """The picture at path as an sRGB RGB image (loaded, the file closed), turned upright by its EXIF orientation as
    the app shows it."""
    with Image.open(path) as im:
        im.load()
        icc = im.info.get("icc_profile")
        up = ImageOps.exif_transpose(im)
        if icc and "icc_profile" not in up.info:
            up.info["icc_profile"] = icc
        return to_srgb(up)
