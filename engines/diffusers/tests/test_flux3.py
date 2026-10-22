# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""FLUX 3 Image Klein: recognising its repos, what is downloaded of them, the memory plan of the MLX runtime, and LoRAs
in Black Forest Labs', diffusers' and kohya's names brought to the transformer's own."""
import os
import sys
import types

import numpy as np
import pytest

import importer
import memory
import registry

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "mlx"))
import flux3  # noqa: E402

VI_CONFIG = {"_class_name": "Flux3KleinMLX", "format": "flux3-mlx", "format_version": 1, "variant": "distilled",
             "flow_map": True, "base_model": "black-forest-labs/flux-3-image-klein"}
BFL_CONFIG = {"format_version": 1, "model": "flux-3-image-klein", "torch_dtype": "bfloat16"}


def test_repos_are_recognised_with_their_defaults():
    assert registry.detect_flux3(VI_CONFIG) == ("flux3_klein", {})
    assert registry.detect_flux3(BFL_CONFIG, {"_class_name": "Flux3DistilledModularPipeline"}) == ("flux3_klein", {})
    base = registry.detect_flux3({"model": "flux-3-image-klein-base"}, {"_class_name": "Flux3ModularPipeline"})
    assert base == ("flux3_klein", {"num_steps": 50, "guidance_scale": 3.5})
    assert registry.detect_flux3(dict(VI_CONFIG, variant="base", flow_map=False))[1]["num_steps"] == 50
    assert registry.detect_flux3({"architectures": ["Qwen3_5ForConditionalGeneration"]}) is None
    with pytest.raises(registry.UnsupportedModel):
        registry.detect_flux3(dict(VI_CONFIG, format_version=2))
    spec = registry.ARCHS["flux3_klein"]
    assert spec["runtime"] == "mlx" and spec["defaults"]["num_steps"] == 16 and spec["img2img"]


def test_only_what_flux3_mlx_reads_is_downloaded():
    mlx_repo = ["README.md", "LICENSE.md", "NOTICE.md", "config.json", "gallery/a.jpg", "gallery/a.json",
                "text_encoder/model.safetensors", "text_encoder/config.json", "transformer/model.safetensors",
                "transformer/config.json", "vae/ae.safetensors", ".gitattributes"]
    assert importer.flux3_files(mlx_repo, VI_CONFIG) == [
        "LICENSE.md", "NOTICE.md", "config.json", "text_encoder/config.json", "text_encoder/model.safetensors",
        "transformer/config.json", "transformer/model.safetensors", "vae/ae.safetensors"]
    bfl_repo = ["model.safetensors", "ae.safetensors", "config.json", "manifest.json", "LICENSE.md", "NOTICE.md",
                "modular_model_index.json", "teaser.jpg", "transformer/diffusion_pytorch_model-00001-of-00002.safetensors",
                "vae/diffusion_pytorch_model.safetensors", "variants/fp8r/model.safetensors",
                "text_encoder/model-00001-of-00002.safetensors", "text_encoder/config.json", "text_encoder/LICENSE"]
    got = importer.flux3_files(bfl_repo, BFL_CONFIG)
    assert "model.safetensors" in got and "ae.safetensors" in got and "text_encoder/LICENSE" in got
    assert not any(f.startswith(("transformer/", "vae/", "variants/")) or f.endswith(".jpg") for f in got)
    with pytest.raises(registry.UnsupportedModel):
        importer.flux3_files(["config.json", "transformer/x.safetensors"], BFL_CONFIG)


def test_the_plan_counts_the_files_as_they_lie_on_disk():
    sizes = {"transformer/model.safetensors": int(4.83e9), "text_encoder/model.safetensors": int(3.4e9),
             "vae/ae.safetensors": int(0.17e9)}
    comps = importer._flux3_components(sizes, list(sizes))
    plan = importer.make_plan({"arch": "flux3_klein", "components": comps, "denoiser": "transformer"}, ram_gb=16)
    assert plan["fits"]
    # 16 GB: the 6 bit repo fits; the 16 bit files of Black Forest Labs do not
    big = importer._flux3_components({"model.safetensors": int(11.1e9), "text_encoder/a.safetensors": int(8.9e9),
                                      "ae.safetensors": int(0.3e9)}, ["model.safetensors", "text_encoder/a.safetensors",
                                                                       "ae.safetensors"])
    assert not importer.make_plan({"arch": "flux3_klein", "components": big, "denoiser": "transformer"}, ram_gb=16)["fits"]


def test_low_memory_when_both_parts_do_not_fit(tmp_path, monkeypatch):
    for path, gb in (("transformer/model.safetensors", 6), ("text_encoder/model.safetensors", 5), ("vae/ae.safetensors", 0.2)):
        (tmp_path / path).parent.mkdir(exist_ok=True)
        with open(tmp_path / path, "wb") as f:
            f.truncate(int(gb * 1e9))
    monkeypatch.setenv("VK_MEMORY_RESERVE_GB", "4")
    assert flux3.plan(str(tmp_path), ram_gb=24)[0] is False
    # 16 GB with 4 kept free: not both, but one after the other (the prompt encoded before the transformer loads)
    low, peak = flux3.plan(str(tmp_path), ram_gb=16)
    assert low is True and peak < 12
    with pytest.raises(MemoryError):
        flux3.plan(str(tmp_path), ram_gb=8)


def test_staging_that_frees_the_denoiser_peaks_at_the_larger_part():
    comps = {"transformer": 5.5, "text_encoder": 4.4, "vae": 0.15}
    shared = memory.plan(comps, "transformer", "flux3", 24, quant="none", allow_staging=True)
    apart = memory.plan(comps, "transformer", "flux3", 24, quant="none", allow_staging=True, staging_frees_denoiser=True)
    assert apart["min_ram_gb"] < shared["min_ram_gb"]


TARGETS = {"content_mode_blocks.image.0.q_proj", "content_mode_blocks.image.0.attn_out", "txt_mode_blocks.3.mlp_in",
           "single_blocks.12.mlp_out", "txt_in", "time_in.in_layer", "ref_time_in.out_layer", "emb_in.image_cond",
           "early_stream_modulations.txt.lin", "final_layer.image.linear", "final_layer.image.adaLN_modulation.1"}


def _lora(names, rank=4, prefix="", style="peft"):
    out = {}
    for n in names:
        down, up = (".lora_A.weight", ".lora_B.weight") if style == "peft" else (".lora_down.weight", ".lora_up.weight")
        out[prefix + n + down] = np.ones((rank, 8), np.float32)
        out[prefix + n + up] = np.arange(16, dtype=np.float32).reshape(16, 1).repeat(rank, 1)
        out[prefix + n + ".alpha"] = np.array(rank / 2, np.float32)
    return out


def test_lora_names_of_black_forest_labs_diffusers_and_kohya():
    bfl = _lora(["content_mode_blocks.image.0.q_proj", "single_blocks.12.mlp_out"], prefix="diffusion_model.")
    layers, total = flux3.lora_layers(bfl, TARGETS)
    assert total == 2 and set(layers) == {"content_mode_blocks.image.0.q_proj", "single_blocks.12.mlp_out"}

    diffusers = _lora(["mode_blocks.image.0.attn.to_out.0", "txt_mode_blocks.3.ff.linear_in", "context_embedder",
                       "target_timestep_embedder.linear_2", "x_embedders.image_cond",
                       "early_stream_modulations.txt.linear", "proj_out", "timestep_embedder.linear_1"],
                      prefix="transformer.")
    layers, total = flux3.lora_layers(diffusers, TARGETS)
    assert total == 8 and set(layers) == {"content_mode_blocks.image.0.attn_out", "txt_mode_blocks.3.mlp_in", "txt_in",
                                          "ref_time_in.out_layer", "emb_in.image_cond", "early_stream_modulations.txt.lin",
                                          "final_layer.image.linear", "time_in.in_layer"}

    kohya = _lora(["lora_unet_content_mode_blocks_image_0_q_proj", "lora_unet_txt_mode_blocks_3_mlp_in"], style="kohya")
    layers, total = flux3.lora_layers(kohya, TARGETS)
    assert total == 2 and set(layers) == {"content_mode_blocks.image.0.q_proj", "txt_mode_blocks.3.mlp_in"}

    # a layer the model does not have is counted, not placed (the engine refuses below 90 %)
    stray = _lora(["single_transformer_blocks.40.attn.to_q"], prefix="transformer.")
    assert flux3.lora_layers(stray, TARGETS) == ({}, 1)


def test_final_modulation_swaps_its_halves_from_diffusers():
    lora = _lora(["norm_out.linear"], prefix="transformer.")
    layers, _ = flux3.lora_layers(lora, TARGETS)
    assert layers["final_layer.image.adaLN_modulation.1"][3] is True
    bfl = _lora(["final_layer.image.adaLN_modulation.1"], prefix="diffusion_model.")
    assert flux3.lora_layers(bfl, TARGETS)[0]["final_layer.image.adaLN_modulation.1"][3] is False


def test_flux3_loras_are_told_apart_from_flux1():
    shapes = lambda names: {n + s: [4, 3072] if "lora_A" in s else [3072, 4] for n in names
                            for s in (".lora_A.weight", ".lora_B.weight")}
    bfl = shapes(["diffusion_model.content_mode_blocks.image.%d.q_proj" % i for i in range(5)])
    assert registry.lora_identity(bfl)["family"] == "flux3"
    diffusers = shapes(["transformer.mode_blocks.image.%d.attn.to_q" % i for i in range(5)]
                       + ["transformer.txt_mode_blocks.0.attn.to_k"])
    assert registry.lora_identity(diffusers)["family"] == "flux3"
    flux1 = shapes(["transformer.transformer_blocks.%d.attn.to_q" % i for i in range(19)]
                   + ["transformer.single_transformer_blocks.%d.attn.to_q" % i for i in range(38)])
    assert registry.lora_identity(flux1)["family"] != "flux3"


def test_activations_of_the_family_are_known():
    assert "flux3" in memory.ACTIVATIONS_GB


def test_macos_companion_files_are_left_out_of_the_text_encoder(tmp_path, monkeypatch):
    monkeypatch.setenv("VK_DATA_DIR", str(tmp_path / "data"))
    model = tmp_path / "model"
    te = model / "text_encoder"
    te.mkdir(parents=True)
    (te / "model.safetensors").write_bytes(b"x")
    (te / "config.json").write_text("{}")
    assert flux3.text_encoder_root(str(model)) == str(model)
    (te / "._model.safetensors").write_bytes(b"\0\5")  # what an exFAT drive gets next to every file
    shadow = flux3.text_encoder_root(str(model))
    assert shadow.startswith(str(tmp_path / "data"))
    assert sorted(os.listdir(os.path.join(shadow, "text_encoder"))) == ["config.json", "model.safetensors"]
    assert os.path.realpath(os.path.join(shadow, "text_encoder", "model.safetensors")) == str((te / "model.safetensors").resolve())
    # made anew: a file no longer in the model (or put there by someone else) is gone
    (te / "config.json").unlink()
    open(os.path.join(shadow, "text_encoder", "extra.safetensors"), "w").close()
    assert sorted(os.listdir(os.path.join(flux3.text_encoder_root(str(model)), "text_encoder"))) == ["model.safetensors"]


def test_a_full_clone_counts_black_forest_labs_files_once():
    sizes = {"model.safetensors": int(11.1e9), "ae.safetensors": int(0.34e9), "text_encoder/a.safetensors": int(8.9e9),
             "transformer/diffusion_pytorch_model-00001-of-00002.safetensors": int(10e9),
             "transformer/diffusion_pytorch_model-00002-of-00002.safetensors": int(1.1e9),
             "vae/diffusion_pytorch_model.safetensors": int(0.34e9)}
    comps = importer._flux3_components(sizes, list(sizes))
    assert round(comps["transformer"], 2) == 5.55 and round(comps["vae"], 2) == 0.17


def test_the_upsampler_gets_room_only_where_it_does_not_fit_beside_the_model(monkeypatch):
    class Pipe:
        _dit, _te = object(), object()
    model = flux3.Flux3Model.__new__(flux3.Flux3Model)
    model.pipeline, model.peak = Pipe(), 8.6
    monkeypatch.setenv("VK_MEMORY_RESERVE_GB", "4")
    mlx = types.ModuleType("mlx")
    mlx.core = types.SimpleNamespace(clear_cache=lambda: None)
    monkeypatch.setitem(sys.modules, "mlx", mlx)
    monkeypatch.setitem(sys.modules, "mlx.core", mlx.core)
    assert model.make_room(5.7, ram_gb=24) is False and model.pipeline._dit is not None
    assert model.make_room(5.7, ram_gb=16) is True
    assert model.pipeline._dit is None and model.pipeline._te is None

