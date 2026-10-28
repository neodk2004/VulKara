# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""ERNIE-Image: recognised from its repository, run by MLX, without the prompt enhancer."""
import importer
import registry

INDEX = {"_class_name": "ErnieImagePipeline", "scheduler": ["diffusers", "FlowMatchEulerDiscreteScheduler"],
         "pe": ["transformers", "Ministral3ForCausalLM"], "pe_tokenizer": ["transformers", "TokenizersBackend"],
         "text_encoder": ["transformers", "Mistral3Model"], "tokenizer": ["transformers", "TokenizersBackend"],
         "transformer": ["diffusers", "ErnieImageTransformer2DModel"], "vae": ["diffusers", "AutoencoderKLFlux2"]}


def test_turbo_and_the_sft_model_are_recognised():
    assert registry.detect_from_model_index(INDEX, {}, "baidu/ERNIE-Image-Turbo") == ("ernie_image", {})
    arch, overrides = registry.detect_from_model_index(INDEX, {}, "baidu/ERNIE-Image")
    assert arch == "ernie_image" and overrides == {"num_steps": 50, "guidance_scale": 4.0}
    spec = registry.ARCHS["ernie_image"]
    assert spec["runtime"] == "mlx" and spec["defaults"]["guidance_scale"] == 1.0 and spec["defaults"]["num_steps"] == 8
    assert registry.family_label("ernie") == "ERNIE-Image" and "ernie" not in registry.FOREIGN_FAMILIES


def test_the_prompt_enhancer_is_not_downloaded():
    files = ["model_index.json", "pe/config.json", "pe/model.safetensors", "pe_tokenizer/tokenizer.json",
             "text_encoder/config.json", "text_encoder/model.safetensors", "tokenizer/tokenizer.json",
             "transformer/config.json", "transformer/diffusion_pytorch_model.safetensors",
             "vae/config.json", "vae/diffusion_pytorch_model.safetensors", "scheduler/scheduler_config.json"]
    wanted, _ = importer._repo_plan_files(files, INDEX)
    assert not [f for f in wanted if f.startswith(("pe/", "pe_tokenizer/"))]
    assert "transformer/diffusion_pytorch_model.safetensors" in wanted and "tokenizer/tokenizer.json" in wanted


def test_fits_16_gb_with_mlx():
    info = {"arch": "ernie_image", "components": dict(registry.ARCHS["ernie_image"]["fallback_params"]),
            "denoiser": "transformer"}
    assert importer.make_plan(info, ram_gb=16)["fits"]
