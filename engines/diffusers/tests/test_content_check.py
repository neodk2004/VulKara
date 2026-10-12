# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Content filter of the results: decisions, fail-closed handling and AI marking (classifiers faked)."""
import os

from PIL import Image

import content_check


class FakeChecker(content_check.Checker):
    def __init__(self, nsfw, ages, fail=False):
        super().__init__()
        self._nsfw_score, self._ages, self._fail = nsfw, ages, fail

    def nsfw(self, img):
        if self._fail:
            raise RuntimeError("model missing")
        return self._nsfw_score

    def faces(self, img):
        return [img] * len(self._ages)

    def _probs(self, which, images):
        return self._ages


def picture(tmp_path, name="out.png"):
    path = str(tmp_path / name)
    Image.new("RGB", (64, 64), (200, 120, 90)).save(path)
    return path


def test_adult_nudity_passes_and_is_marked(tmp_path):
    path = picture(tmp_path)
    ans = content_check.handle(FakeChecker(0.95, [{"26-30": 0.9, "21-25": 0.1}]), {"path": path, "model": "m"})
    assert ans == {"ok": True}
    text = Image.open(path).text
    assert "trainedAlgorithmicMedia" in text["XML:com.adobe.xmp"] and "model: m" in text["Comment"]


def test_nudity_with_a_likely_minor_is_blocked_and_deleted(tmp_path, monkeypatch):
    monkeypatch.setenv("VK_IMAGES_DIR", str(tmp_path))
    path = picture(tmp_path)
    ans = content_check.handle(FakeChecker(0.9, [{"13-15": 0.7, "16-20": 0.3}]), {"path": path})
    assert not ans["ok"] and ans["blocked"] and "minor" in ans["reason"]
    assert not os.path.exists(path)


def test_age_16_to_20_counts_partly():
    c = FakeChecker(0.9, [{"16-20": 1.0}])
    assert c.minor(None) == content_check.MINOR_SHARE["16-20"] < content_check.MINOR_LIMIT


def test_safe_mode_blocks_any_nudity_but_not_clothed(tmp_path):
    path = picture(tmp_path)
    assert not content_check.handle(FakeChecker(0.8, []), {"path": path, "safe_mode": True})["ok"]
    path = picture(tmp_path, "b.png")
    assert content_check.handle(FakeChecker(0.1, [{"01": 1.0}]), {"path": path, "safe_mode": True})["ok"]


def test_fails_closed(tmp_path):
    path = picture(tmp_path)
    ans = content_check.handle(FakeChecker(0, [], fail=True), {"path": path})
    assert not ans["ok"] and "could not check" in ans["reason"]


def test_a_blocked_file_outside_the_pictures_folder_stays(tmp_path, monkeypatch):
    monkeypatch.setenv("VK_IMAGES_DIR", str(tmp_path / "images"))
    path = picture(tmp_path)
    ans = content_check.handle(FakeChecker(0.9, [{"13-15": 0.9}]), {"path": path})
    assert not ans["ok"] and os.path.exists(path)


def test_a_preview_picture_is_removed_when_blocked_and_never_marked(tmp_path, monkeypatch):
    monkeypatch.setenv("VK_IMAGES_DIR", str(tmp_path / "images"))
    blocked = picture(tmp_path, "preview.jpg")
    assert not content_check.handle(FakeChecker(0.9, []), {"path": blocked, "safe_mode": True, "preview": True})["ok"]
    assert not os.path.exists(blocked)
    ok = picture(tmp_path, "preview.jpg")
    assert content_check.handle(FakeChecker(0.1, []), {"path": ok, "safe_mode": True, "preview": True}) == {"ok": True}
    assert "XML:com.adobe.xmp" not in (Image.open(ok).info or {})


def test_a_training_picture_is_only_judged(tmp_path, monkeypatch):
    monkeypatch.setenv("VK_IMAGES_DIR", str(tmp_path))
    blocked = picture(tmp_path, "mine.png")
    assert not content_check.handle(FakeChecker(0.9, [{"13-15": 0.9}]), {"path": blocked, "keep": True})["ok"]
    assert os.path.exists(blocked)
    fine = picture(tmp_path, "ok.png")
    assert content_check.handle(FakeChecker(0.1, []), {"path": fine, "keep": True}) == {"ok": True}
    assert "XML:com.adobe.xmp" not in (Image.open(fine).info or {})


def test_the_label_is_written_into_the_corner_when_asked_and_the_picture_stays_marked(tmp_path, monkeypatch):
    import numpy as np
    monkeypatch.setenv("VK_IMAGES_DIR", str(tmp_path))
    path = str(tmp_path / "out.png")
    Image.new("RGB", (400, 300), (40, 60, 120)).save(path)
    before = np.asarray(Image.open(path).convert("RGB")).astype(int)
    assert content_check.handle(FakeChecker(0.1, []), {"path": path, "label": {"size": "large", "kind": "generated"}}) == {"ok": True}
    after = np.asarray(Image.open(path).convert("RGB")).astype(int)
    changed = np.abs(after - before).sum(-1) > 30
    assert changed[200:, 200:].sum() > 50 and changed[:150, :].sum() == 0  # only the lower right corner
    assert "trainedAlgorithmicMedia" in Image.open(path).text["XML:com.adobe.xmp"]
    # the copy without the label carries the machine-readable notice too
    clean = os.path.join(tmp_path, content_check.UNLABELLED, "out.png")
    assert "trainedAlgorithmicMedia" in Image.open(clean).text["XML:com.adobe.xmp"]
    plain = str(tmp_path / "plain.png")
    Image.new("RGB", (400, 300), (40, 60, 120)).save(plain)
    content_check.handle(FakeChecker(0.1, []), {"path": plain})
    assert np.array_equal(np.asarray(Image.open(plain).convert("RGB")), before.astype(np.uint8))


def test_the_eu_icon_takes_the_tone_the_corner_needs_and_every_kind_is_there(tmp_path):
    """Black on a light corner, white on a dark one (or as asked), each kind, also the subtle 50 % variant."""
    import numpy as np
    for kind in content_check.LABEL_KINDS:
        for tone in ("black", "white"):
            for half in ("", "_50"):
                assert os.path.isfile(os.path.join(content_check.LABEL_DIR, "%s_%s%s.png" % (kind, tone, half)))

    def labelled(colour, **kw):
        path = str(tmp_path / ("p_%d_%s.png" % (colour[0], "_".join("%s%s" % i for i in kw.items()))))
        Image.new("RGB", (480, 320), colour).save(path)
        content_check.label(path, "large", **kw)
        a = np.asarray(Image.open(path).convert("RGB")).astype(int)
        changed = np.abs(a - np.array(colour)).sum(-1) > 30
        assert changed[200:, 240:].sum() > 50 and changed[:150].sum() == 0  # only the lower right corner
        return a[changed].mean()

    assert labelled((240, 240, 240), kind="generated") < 120   # light picture: the black icon
    assert labelled((20, 20, 30), kind="modified") > 120       # dark picture: the white icon
    assert labelled((240, 240, 240), kind="ai", tone="white") > 120  # a tone asked for is kept
    # the subtle icon changes the picture less than the full one
    full = labelled((240, 240, 240), kind="ai", tone="black")
    subtle = labelled((240, 240, 240), kind="ai", tone="black", subtle=True)
    assert subtle > full
    # the picture without the label is kept next to it, unchanged
    path = str(tmp_path / "clean.png")
    Image.new("RGB", (480, 320), (90, 90, 90)).save(path)
    before = open(path, "rb").read()
    content_check.label(path, "medium", "generated")
    assert open(os.path.join(tmp_path, content_check.UNLABELLED, "clean.png"), "rb").read() == before
    assert open(path, "rb").read() != before
    # an unknown kind falls back to "AI GENERATED"
    path = str(tmp_path / "unknown.png")
    Image.new("RGB", (480, 320), (40, 60, 120)).save(path)
    content_check.label(path, "small", "no-such-kind")
