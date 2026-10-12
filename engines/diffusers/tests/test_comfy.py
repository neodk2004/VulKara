# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""ComfyUI runtime: Anima detection, workflows, Civitai companion files."""
import importlib.util
import os

import civitai
import importer
import registry


def _workflows():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                        "comfy", "workflows.py")
    spec = importlib.util.spec_from_file_location("comfy_workflows", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_anima_is_recognised_with_and_without_prefix():
    keys = {"llm_adapter.blocks.0.cross_attn.q_proj.weight": [1], "blocks.0.self_attn.q_proj.weight": [1]}
    assert registry.detect_from_single_file(keys, "anima-base.safetensors")[:2] == ("anima", "comfy_files")
    prefixed = {"model.diffusion_model." + k: v for k, v in keys.items()}
    arch, layout, overrides, _ = registry.detect_from_single_file(prefixed, "anima-turbo-v1.1.safetensors")
    assert (arch, layout) == ("anima", "comfy_files")
    cosmos_style = {"net." + k: v for k, v in keys.items()}  # fine-tunes saved with the Cosmos prefix
    assert registry.detect_from_single_file(cosmos_style, "miaomiao.safetensors")[:2] == ("anima", "comfy_files")
    assert overrides == {"num_steps": 10, "guidance_scale": 1.0}  # Turbo: CFG 1, 8-12 steps
    # "all in one": text encoder and VAE in the same file, under the SD 1.x names
    aio = {**prefixed, "cond_stage_model.qwen3_06b.transformer.model.norm.weight": [1],
           "first_stage_model.decoder.conv1.weight": [1]}
    assert registry.detect_from_single_file(aio, "anima-v1-turbo-aio.safetensors")[:2] == ("anima", "comfy_files")
    spec = registry.ARCHS["anima"]
    assert spec["runtime"] == "comfyui" and set(spec["comfy"]["base_files"]) == {"text_encoder", "vae"}


def test_anima_fits_16_gb():
    info = {"arch": "anima", "components": dict(registry.ARCHS["anima"]["fallback_params"]), "denoiser": "transformer"}
    assert importer.make_plan(info, ram_gb=16)["fits"]  # about 9 GB peak, from 14 GB RAM


def test_workflow_text_to_image_image_to_image_and_loras():
    wf = _workflows()
    files = {"diffusion_model": "m__diffusion_model.safetensors", "text_encoder": "m__text_encoder.safetensors",
             "vae": "m__vae.safetensors"}
    comfy = registry.ARCHS["anima"]["comfy"]
    job = {"prompt": "a cat", "negative_prompt": "blurry", "width": 1024, "height": 768, "steps": 30, "cfg": 4.0, "seed": 5}
    g = wf.build(job, files, comfy)
    assert g["unet"]["inputs"]["unet_name"] == files["diffusion_model"]
    assert g["clip"]["inputs"] == {"clip_name": files["text_encoder"], "type": "stable_diffusion", "device": "default"}
    assert g["latent"]["class_type"] == "EmptyLatentImage" and g["latent"]["inputs"]["height"] == 768
    s = g["sample"]["inputs"]
    assert (s["sampler_name"], s["scheduler"], s["denoise"], s["model"]) == ("er_sde", "simple", 1.0, ["unet", 0])
    # image to image with a LoRA and the app's sampler names
    g = wf.build(dict(job, strength=0.6, sampler="DPM++ 2M", sigma_schedule="Karras"), files, comfy,
                 loras=[("tattoo.safetensors", 0.8)], input_image="in.png")
    assert g["latent"]["class_type"] == "VAEEncode" and g["image"]["inputs"]["image"] == "in.png"
    s = g["sample"]["inputs"]
    assert (s["sampler_name"], s["scheduler"], s["denoise"], s["model"]) == ("dpmpp_2m", "karras", 0.6, ["lora0", 0])
    assert g["pos"]["inputs"]["clip"] == ["lora0", 1]


def test_civitai_brings_the_versions_text_encoder_and_vae(monkeypatch):
    def f(name, ftype, primary=False):
        return {"name": name, "type": ftype, "primary": primary, "downloadUrl": "u/" + name, "sizeKB": 1000,
                "metadata": {"format": "SafeTensor", "fp": "bf16"}}
    model = {"type": "Checkpoint", "name": "MiaoMiao", "modelVersions": [{"id": 9, "name": "Anima1.3", "baseModel": "Anima",
             "files": [f("vae.safetensors", "VAE"), f("model.safetensors", "Model", True), f("txt.safetensors", "Text Encoder")]}]}
    monkeypatch.setattr(civitai, "_get_json", lambda url, token=None: model)
    c = civitai.resolve("https://civitai.com/models/1/m")
    assert (c["arch"], c["file_name"]) == ("anima", "model.safetensors")
    assert sorted((e["part"], e["file_name"]) for e in c["extras"]) == [("text_encoder", "txt.safetensors"),
                                                                       ("vae", "vae.safetensors")]


def _wan_keys(out_channels):
    return {"patch_embedding.weight": [3072, 48, 1, 2, 2], "head.modulation": [1, 2, 3072],
            "head.head.weight": [out_channels * 4, 3072], "blocks.0.self_attn.q.weight": [3072, 3072]}


def test_wan22_5b_is_recognised_and_14b_refused():
    arch, layout, _, _ = registry.detect_from_single_file(_wan_keys(48), "wan2.2_ti2v_5B_fp16.safetensors")
    assert (arch, layout) == ("wan22_ti2v", "comfy_files")
    prefixed = {"model.diffusion_model." + k: v for k, v in _wan_keys(48).items()}
    assert registry.detect_from_single_file(prefixed, "x.safetensors")[0] == "wan22_ti2v"
    spec = registry.ARCHS["wan22_ti2v"]
    assert spec["kind"] == "video" and spec["runtime"] == "comfyui" and spec["comfy"]["clip_type"] == "wan"
    try:
        registry.detect_from_single_file(_wan_keys(16), "wan2.2_i2v_high_noise_14B.safetensors")
        assert False, "14B accepted"
    except registry.UnsupportedModel as e:
        assert "5B" in str(e)


def test_wan22_14b_gguf_is_recognised_and_needs_the_high_noise_file():
    # GGUF lists dimensions innermost first (as read from the real QuantStack file)
    keys = {"patch_embedding.weight": [2, 2, 1, 36, 5120], "head.modulation": [5120, 2, 1],
            "head.head.weight": [5120, 64], "blocks.0.self_attn.q.weight": [5120, 5120]}
    arch, layout, _, _ = registry.detect_from_single_file(keys, "HighNoise/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf")
    assert (arch, layout) == ("wan22_i2v_14b", "comfy_files")
    for name in ("LowNoise/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf", "wan2.1_i2v_480p_14B.gguf"):
        try:
            registry.detect_from_single_file(keys, name)
            assert False, name
        except registry.UnsupportedModel:
            pass
    base = registry.ARCHS["wan22_i2v_14b"]["comfy"]["base_files"]
    assert set(base) == {"diffusion_model_low", "lora_high", "lora_low", "text_encoder", "vae"}
    assert importer.base_file_source("QuantStack/x", base["vae"])[0] == "Comfy-Org/Wan_2.2_ComfyUI_Repackaged"
    assert importer.base_file_source("QuantStack/x", base["diffusion_model_low"]) == ("QuantStack/x", base["diffusion_model_low"])


def test_video_frames_are_4n_plus_1():
    wf = _workflows()
    assert [wf.video_frames(s, 24) for s in (2, 3.5, 5)] == [45, 81, 117]
    assert all((wf.video_frames(s, 24) - 1) % 4 == 0 for s in (0.1, 1, 2.2, 7))


def test_workflow_image_to_video():
    wf = _workflows()
    files = {"diffusion_model": "w__diffusion_model.safetensors", "text_encoder": "w__text_encoder.safetensors",
             "vae": "w__vae.safetensors"}
    comfy = registry.ARCHS["wan22_ti2v"]["comfy"]
    job = {"prompt": "she smiles", "negative_prompt": "static", "width": 832, "height": 480, "steps": 30, "cfg": 5.0,
           "seed": 3, "frames": 49, "fps": 24}
    g = wf.build_video(job, files, comfy, input_image="start.png")
    assert g["clip"]["inputs"]["type"] == "wan"
    assert g["shift"]["inputs"] == {"model": ["unet", 0], "shift": 8.0}
    lat = g["latent"]["inputs"]
    assert g["latent"]["class_type"] == "Wan22ImageToVideoLatent"
    assert (lat["width"], lat["height"], lat["length"], lat["start_image"]) == (832, 480, 49, ["image", 0])
    s = g["sample"]["inputs"]
    assert (s["model"], s["latent_image"], s["sampler_name"]) == (["shift", 0], ["latent", 0], "uni_pc")
    assert g["video"]["inputs"] == {"images": ["decode", 0], "fps": 24.0}
    assert g["save"]["class_type"] == "SaveVideo" and g["save"]["inputs"]["video"] == ["video", 0]
    for node in g.values():  # every link points to an existing node
        for v in node["inputs"].values():
            if isinstance(v, list):
                assert v[0] in g, v
    assert "start_image" not in wf.build_video(job, files, comfy)["latent"]["inputs"]  # text to video


def test_workflow_two_stage_14b_video():
    wf = _workflows()
    files = {"diffusion_model": "w__diffusion_model.gguf", "diffusion_model_low": "w__diffusion_model_low.gguf",
             "lora_high": "w__lora_high.safetensors", "lora_low": "w__lora_low.safetensors",
             "text_encoder": "w__text_encoder.safetensors", "vae": "w__vae.safetensors"}
    spec = registry.ARCHS["wan22_i2v_14b"]
    d = spec["defaults"]
    job = {"prompt": "she smiles", "negative_prompt": "static", "width": 832, "height": 480, "steps": d["num_steps"],
           "cfg": d["guidance_scale"], "seed": 3, "frames": 49, "fps": d["fps"]}
    g = wf.build_video(job, files, spec["comfy"], input_image="start.png")
    assert g["unet_high"]["class_type"] == g["unet_low"]["class_type"] == "UnetLoaderGGUFAdvanced"
    assert g["unet_low"]["inputs"]["patch_on_device"] is True
    assert g["lora_low"]["inputs"] == {"model": ["unet_low", 0], "lora_name": "w__lora_low.safetensors", "strength_model": 1.0}
    assert g["i2v"]["class_type"] == "WanImageToVideo" and g["i2v"]["inputs"]["start_image"] == ["image", 0]
    hi, lo = g["sample_high"]["inputs"], g["sample_low"]["inputs"]
    assert (hi["start_at_step"], hi["end_at_step"], hi["add_noise"], hi["return_with_leftover_noise"]) == (0, 2, "enable", "enable")
    assert (lo["start_at_step"], lo["add_noise"], lo["latent_image"], lo["model"]) == (2, "disable", ["sample_high", 0], ["shift_low", 0])
    assert (hi["cfg"], hi["sampler_name"], hi["steps"]) == (1.0, "euler", 4)
    assert g["video"]["inputs"]["fps"] == 16.0 and g["decode"]["inputs"]["samples"] == ["sample_low", 0]
    for node in g.values():
        for v in node["inputs"].values():
            if isinstance(v, list):
                assert v[0] in g, v


def test_upscale_workflow():
    workflows = _workflows()
    g = workflows.build_upscale("in.png", "RealESRGAN_x4plus.safetensors")
    assert g["image"]["inputs"]["image"] == "in.png"
    assert g["model"]["inputs"]["model_name"] == "RealESRGAN_x4plus.safetensors"
    assert g["up"]["inputs"] == {"upscale_model": ["model", 0], "image": ["image", 0]}
    assert g["save"]["inputs"]["images"] == ["up", 0] and "scaled" not in g
    # twice the size: four times, then half
    g = workflows.build_upscale("in.png", "m.safetensors", factor=2)
    assert g["scaled"]["inputs"]["scale_by"] == 0.5 and g["save"]["inputs"]["images"] == ["scaled", 0]
    # any factor in between: 2.2 times is four times, then 0.55
    g = workflows.build_upscale("in.png", "m.safetensors", factor=2.2)
    assert abs(g["scaled"]["inputs"]["scale_by"] - 0.55) < 1e-9
    assert "scaled" not in workflows.build_upscale("in.png", "m.safetensors", factor=4.0)


def test_a_large_picture_is_made_smaller_before_upscaling_and_measured_on_the_original():
    plan = _workflows().upscale_plan
    # small enough: as it is, the factor as asked
    assert plan((1000, 800), 2.0) == ((1000, 800), (2000, 1600))
    # 4096 × 3072 at × 2: the model gets 2048 × 1536 and enlarges it 4 times -> 8192 × 6144 = twice the original
    assert plan((4096, 3072), 2.0) == ((2048, 1536), (8192, 6144))
    # 3072 × 2048 at × 2: the model gets 2048 × 1365; the result is exactly 6144 × 4096 (not 3 × 1365 = 4095)
    assert plan((3072, 2048), 2.0) == ((2048, 1365), (6144, 4096))
    # more than four times what the model gets is not possible: four times
    assert plan((8192, 4096), 4.0) == ((2048, 1024), (8192, 4096))
    g = _workflows().build_upscale("in.png", "m.safetensors", size=(6144, 4096))
    assert g["scaled"]["class_type"] == "ImageScale" and (g["scaled"]["inputs"]["width"], g["scaled"]["inputs"]["height"]) == (6144, 4096)
