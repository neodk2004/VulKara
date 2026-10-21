# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
import io
import json
import os

import pytest

import previews


def test_civitai_picks_the_most_harmless_image_small():
    images = [{"url": "https://image.civitai.com/x/abc/width=1024/1.jpeg", "nsfw_level": 8},
              {"url": "https://image.civitai.com/x/def/width=832/2.jpeg", "nsfw_level": 1}]
    assert previews.civitai_image(images) == "https://image.civitai.com/x/def/width=512/2.jpeg"
    assert previews.civitai_image([]) is None


def test_hf_prefers_example_pictures(monkeypatch):
    class Api:
        def __init__(self, token=None):
            pass

        def list_repo_files(self, repo):
            return ["README.md", "assets/logo.png", "samples/a.webp", "dev_grid.jpg", "model.safetensors"]
    import huggingface_hub
    monkeypatch.setattr(huggingface_hub, "HfApi", Api)
    assert previews.hf_image("org/model") == "dev_grid.jpg"


def test_save_makes_a_square_thumbnail(tmp_path):
    PIL = pytest.importorskip("PIL.Image")
    buf = io.BytesIO()
    PIL.new("RGB", (1200, 800), "red").save(buf, "PNG")
    path = previews._save(buf.getvalue(), str(tmp_path))
    assert PIL.open(path).size == (previews.SIZE, previews.SIZE)


def test_missing_lists_models_without_preview(tmp_path):
    for name, files in (("a", ["model.json"]), ("b", ["model.json", "preview.jpg"]), ("c", []),
                        ("l", ["lora.json"])):
        os.makedirs(tmp_path / name)
        for f in files:
            (tmp_path / name / f).write_text(json.dumps({}))
    assert [os.path.basename(p) for p in previews.missing([str(tmp_path)])] == ["a", "l"]


def _lora(tmp_path, name, tag_frequency=None, trigger_words=()):
    folder = tmp_path / name
    folder.mkdir()
    meta = {"ss_tag_frequency": json.dumps({"img": tag_frequency})} if tag_frequency else {}
    header = json.dumps({"__metadata__": meta}).encode()
    (folder / "lora.safetensors").write_bytes(len(header).to_bytes(8, "little") + header)
    (folder / "lora.json").write_text(json.dumps({"name": name, "file": "lora.safetensors",
                                                     "trigger_words": list(trigger_words)}))
    return str(folder)


def test_lora_picture_uses_a_whole_training_caption(tmp_path):
    folder = _lora(tmp_path, "t4tt00-tattoo", {
        "t4tt00 black and white drawing tattoo of a cheshire cat": 1,
        "t4tt00 black and white drawing tattoo of a rose with thorns": 1,
        "wearing a top hat and holding a pocket clock": 1,  # a fragment after a comma
        "set against a white background.": 2})
    assert previews.lora_prompt(folder).startswith("t4tt00 black and white drawing tattoo of")


def test_lora_picture_uses_training_tags_or_name_and_triggers(tmp_path):
    tags = _lora(tmp_path, "styled", {"monochrome": 9, "solo": 8, "tattoo_style": 7, "flower": 5, "skull": 3})
    assert previews.lora_prompt(tags).startswith("monochrome, tattoo_style, flower")
    named = _lora(tmp_path, "fantasy-digital-painting", trigger_words=["zaat style"])
    assert previews.lora_prompt(named).startswith("zaat style, fantasy a digital painting of")
