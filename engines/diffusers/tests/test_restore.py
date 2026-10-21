# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""The restoration of old photos: correction and the guard rails of the AI steps (restore.py)."""
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import restore as rs  # noqa: E402


def photo(sepia=False, size=(320, 240)):
    """A test 'photo': shapes on a gradient; as a toned black-and-white print when sepia."""
    img = Image.new("RGB", size, (90, 120, 160))
    d = ImageDraw.Draw(img)
    for i in range(0, size[0], 16):
        d.line([(i, 0), (i, size[1])], fill=(40 + i // 3, 90, 60), width=3)
    d.ellipse([100, 60, 220, 180], fill=(220, 180, 140))
    if sepia:
        g = np.asarray(img.convert("L"), np.float32)
        img = Image.fromarray(np.stack([g * 1.0, g * 0.85, g * 0.65], axis=2).clip(0, 255).astype(np.uint8))
    return img


def lab(img):
    return cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2LAB).astype(np.int16)


def test_black_and_white_photos_are_recognised_also_when_toned():
    assert rs.is_grayscale(photo(sepia=True))
    assert not rs.is_grayscale(photo())


def test_correction_removes_a_colour_cast_and_makes_toned_prints_neutral():
    cast = Image.fromarray((np.asarray(photo(), np.float32) * [1.0, 0.75, 0.6]).astype(np.uint8))
    means = np.asarray(rs.correct(cast), np.float32).reshape(-1, 3).mean(0)
    assert means.max() - means.min() < 0.25 * means.mean()  # the red cast is gone
    neutral = np.asarray(rs.correct(photo(sepia=True)), np.int16)
    assert np.abs(neutral[..., 0] - neutral[..., 2]).max() <= 2  # grey, not brown


def test_the_prompt_holds_the_fixed_rules_the_users_rules_and_the_note():
    text = rs.guard_prompt(["Keep the house number"], note="a wedding photo")
    assert text.startswith("a wedding photo")
    assert all(r in text for r in rs.BASE_RULES)
    assert rs.GRAY_RULE in text and "Keep the house number" in text


def test_outside_the_painted_damage_the_original_stays():
    original, ai = photo(), Image.new("RGB", (320, 240), (255, 0, 0))
    mask = Image.new("L", (320, 240), 0)
    ImageDraw.Draw(mask).rectangle([10, 10, 40, 40], fill=255)
    out, weights = rs.compose(original, ai, mask, repair=True, lock=True)
    o, r = np.asarray(original), np.asarray(out)
    far = weights < 0.001
    assert np.array_equal(o[far], r[far])  # untouched, to the pixel
    assert r[25, 25, 0] > 200  # repaired inside


def test_colouring_keeps_the_brightness_of_the_original():
    original = photo(sepia=True).convert("L").convert("RGB")
    ai = Image.fromarray(np.roll(np.asarray(photo()), 40, axis=1))  # a "colourful" result with moved shapes
    out, _ = rs.compose(original, ai, None, repair=False, colorize=True)
    assert np.abs(lab(out)[..., 0] - lab(original)[..., 0]).max() <= 3  # the shapes are the original's
    assert np.abs(lab(out)[..., 1:] - 128).mean() > 3  # but it has colours now


def test_too_much_change_is_refused():
    original = photo()
    moved = Image.fromarray(np.roll(np.asarray(original), 60, axis=1))
    ok, message = rs.check(original, moved, None, max_change=0.06)
    assert not ok and "allowed" in message
    ok, _ = rs.check(original, original, None, max_change=0.06)
    assert ok


def test_damage_is_filled_from_its_surroundings_before_the_ai_sees_it():
    img = Image.new("RGB", (200, 160), (60, 60, 60))
    ImageDraw.Draw(img).rectangle([80, 60, 120, 100], fill=(255, 255, 255))  # a white hole
    mask = Image.new("L", (200, 160), 0)
    ImageDraw.Draw(mask).rectangle([80, 60, 120, 100], fill=255)
    filled = np.asarray(rs.prefill(img, mask, report=lambda *_: None))
    assert filled[80, 100].max() < 120  # the hole took the grey around it
    assert rs.prefill(img, None) is img


def test_marks_close_together_share_one_area_and_each_area_stays_in_the_photo():
    m = np.zeros((300, 400), np.uint8)
    m[50:60, 50:60] = 1
    m[70:80, 70:80] = 1  # near the first
    m[250:260, 350:360] = 1  # far away
    boxes = rs._boxes(m, 24)
    assert len(boxes) == 2
    for x0, y0, x1, y1 in boxes:
        assert 0 <= x0 < x1 <= 400 and 0 <= y0 < y1 <= 300 and (x1 - x0) == (y1 - y0)


def test_a_face_that_appears_vanishes_or_moves_is_noticed():
    assert rs.faces_kept([(0.5, 0.4)], [(0.51, 0.41)])
    assert not rs.faces_kept([(0.5, 0.4)], [])
    assert not rs.faces_kept([(0.5, 0.4)], [(0.5, 0.4), (0.2, 0.3)])
    assert not rs.faces_kept([(0.5, 0.4)], [(0.8, 0.4)])
    # the check uses the detector on both pictures
    faces = iter([{"width": 100, "height": 100, "people": [{"face": [[50, 40]] * 12}]},
                  {"width": 100, "height": 100, "people": []}])
    ok, message = rs.check(photo(), photo(), None, 0.06, detect=lambda img: next(faces))
    assert not ok and "faces" in message


def test_sharpening_lessens_grain_and_keeps_the_picture():
    rng = np.random.default_rng(1)
    clean = np.asarray(photo().convert("L"), np.float32)
    noisy = np.clip(clean + rng.normal(0, 12, clean.shape), 0, 255).astype(np.uint8)
    out = np.asarray(rs.sharpen(Image.fromarray(noisy).convert("RGB"), 0.6).convert("L"), np.float32)
    flat = (slice(5, 50), slice(250, 310))  # a plain part of the test photo: there only grain changes it
    assert out[flat].std() < noisy[flat].std() * 0.7
    assert np.abs(out - clean).mean() < 12  # still the same picture
