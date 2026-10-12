# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Ideogram 4: detection of its transformer files, the partner file, memory plan with two transformers."""
import json
import struct

import pytest

import importer
import memory
import registry


def _write(path, model_type, extra_key=None):
    """A safetensors header shaped like Ideogram 4's ComfyUI FP8 files (tiny tensors)."""
    header = {"__metadata__": {"model_type": model_type} if model_type else {}}
    names = ["llm_cond_proj.weight", "input_proj.weight", "layers.0.attention.qkv.weight",
             "layers.0.attention.qkv.weight_scale", "layers.0.attention.o.weight", "layers.0.feed_forward.w1.weight"]
    if extra_key:
        names.append(extra_key)
    offset = 0
    for n in names:
        header[n] = {"dtype": "BF16", "shape": [2, 2], "data_offsets": [offset, offset + 8]}
        offset += 8
    raw = json.dumps(header).encode()
    with open(path, "wb") as f:
        f.write(struct.pack("<Q", len(raw)) + raw + b"\0" * offset)
    return str(path)


def test_a_transformer_file_is_recognised():
    shapes = {"llm_cond_proj.weight": [4608, 53248], "layers.0.attention.qkv.weight": [13824, 4608]}
    arch, layout, _, _ = registry.detect_from_single_file(shapes, "ideogram4_fp8_scaled.safetensors")
    assert (arch, layout) == ("ideogram4", "single_denoiser")
    assert registry.ARCHS["ideogram4"]["runtime"] == "mlx"


def test_the_partner_file_is_found_from_either_side(tmp_path):
    cond = _write(tmp_path / "ideogram4_fp8_scaled.safetensors", "ideogram4_cond")
    uncond = _write(tmp_path / "ideogram4_unconditional_fp8_scaled.safetensors", "ideogram4_uncond")
    _write(tmp_path / "something_else.safetensors", "other", extra_key="x.weight")
    expected = {"transformer": cond, "unconditional_transformer": uncond}
    assert importer._ideogram_sources(cond) == expected
    assert importer._ideogram_sources(uncond) == expected


def test_without_metadata_the_file_name_decides(tmp_path):
    cond = _write(tmp_path / "ideogram4.safetensors", None)
    uncond = _write(tmp_path / "ideogram4_uncond.safetensors", None)
    assert importer._ideogram_sources(cond) == {"transformer": cond, "unconditional_transformer": uncond}


def test_a_missing_partner_is_explained(tmp_path):
    cond = _write(tmp_path / "ideogram4_fp8_scaled.safetensors", "ideogram4_cond")
    with pytest.raises(registry.UnsupportedModel, match="unconditional"):
        importer._ideogram_sources(cond)


def test_base_files_leave_out_both_transformers():
    files = ["model_index.json", "transformer/config.json", "transformer/model.safetensors",
             "unconditional_transformer/model.safetensors.index.json",
             "unconditional_transformer/model-00001-of-00002.safetensors", "text_encoder/model.safetensors",
             "text_encoder/config.json", "vae/diffusion_pytorch_model.safetensors"]
    comps = list(registry.ARCHS["ideogram4"]["native_files"])
    kept = [f for f in files if not importer._is_replaced(f, comps)]
    assert kept == ["model_index.json", "transformer/config.json", "text_encoder/model.safetensors",
                    "text_encoder/config.json", "vae/diffusion_pytorch_model.safetensors"]


def test_both_transformers_count_and_share_the_precision():
    comps = dict(registry.ARCHS["ideogram4"]["fallback_params"])
    # 24 GB: 4 bit, and only with the text encoder freed while denoising
    assert not memory.plan(comps, "transformer", "ideogram4", 24, quant="q4", allow_staging=False)["fits"]
    p = memory.plan(comps, "transformer", "ideogram4", 24, quant="q4", allow_staging=True)
    assert p["fits"] and p["staged_text_encoder"]
    assert p["quant"]["unconditional_transformer"] == p["quant"]["transformer"] == "q4"
    # both transformers are in the denoising peak (2 x 9.28B at 4 bit, not one)
    assert p["denoise_peak_gb"] >= 2 * 9.28 * memory.BYTES_PER_PARAM["q4"]
    assert not memory.plan(comps, "transformer", "ideogram4", 16, quant="q4")["fits"]


def test_the_import_plan_uses_staging():
    spec = registry.ARCHS["ideogram4"]
    info = {"arch": "ideogram4", "components": dict(spec["fallback_params"]), "denoiser": "transformer"}
    assert importer.make_plan(info, ram_gb=24)["fits"]


def test_files_on_another_disk_are_linked_not_copied(tmp_path, monkeypatch):
    src = tmp_path / "ideogram4_fp8_scaled.safetensors"
    src.write_bytes(b"x" * 10)

    def no_hard_links(a, b):
        raise OSError(18, "Cross-device link")  # other disk, or exFAT
    monkeypatch.setattr(importer.os, "link", no_hard_links)
    dst = tmp_path / "model" / "transformer.safetensors"
    dst.parent.mkdir()
    assert importer._link_or_symlink(str(src), str(dst)) is True
    assert dst.is_symlink() and dst.read_bytes() == b"x" * 10


def test_an_imported_model_folder_is_registered_where_it_is(tmp_path, capsys):
    (tmp_path / "model.json").write_text(json.dumps({"engine": "diffusers", "arch": "ideogram4", "name": "I4"}))
    m = importer.run_import("dir", str(tmp_path), "I4")
    assert m["arch"] == "ideogram4"
    assert '"model_path": "%s"' % tmp_path in capsys.readouterr().out
    assert sorted(p.name for p in tmp_path.iterdir()) == ["model.json"]  # nothing copied or created


def _mlx_main():
    import importlib.util
    import os
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                        "mlx", "main.py")
    spec = importlib.util.spec_from_file_location("mlx_main", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_plain_prompts_become_full_captions():
    caption = _mlx_main().ideogram_caption
    c = caption("A vintage travel poster with the words VULKARA above a lake")
    assert list(c) == ["high_level_description", "style_description", "compositional_deconstruction"]
    assert "art_style" in c["style_description"] and "photo" not in c["style_description"]
    texts = [e["text"] for e in c["compositional_deconstruction"]["elements"] if e["type"] == "text"]
    assert texts == ["VULKARA"]
    c = caption('a cafe sign saying "Open Late" at night')
    assert [e.get("text") for e in c["compositional_deconstruction"]["elements"]] == [None, "Open Late"]
    c = caption("a red fox in the snow")
    assert list(c["style_description"])[-2:] == ["photo", "medium"]  # the order mflux's schema wants
    assert all(e["type"] == "obj" for e in c["compositional_deconstruction"]["elements"])
