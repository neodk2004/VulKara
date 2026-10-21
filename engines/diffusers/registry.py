# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Supported model architectures and how to recognise them.

Detection works on metadata only (model_index.json / transformer config /
safetensors or GGUF headers), so it never loads weights.
"""
import json
import os
import re
import struct


class UnsupportedModel(ValueError):
    pass


class LoraFile(UnsupportedModel):
    """The file holds LoRA adapter weights, not a model."""


def _res(lo, hi, step=64):
    return list(range(lo, hi + 1, step))


# fallback_params are billions of parameters per component, used only when the
# real sizes can not be read (e.g. a curated entry before any metadata request).
# SD 1.x / 2.x pipelines run without their built-in safety checker: the app checks every result of every
# model itself (content_check.py), which the checker of these two families could not do
NO_SAFETY_CHECKER = {"safety_checker": None, "feature_extractor": None, "requires_safety_checker": False}

ARCHS = {
    "sd15": {
        "family": "sd1", "label": "Stable Diffusion 1.5",
        "pipeline": "StableDiffusionPipeline", "img2img_pipeline": "StableDiffusionImg2ImgPipeline",
        "inpaint_pipeline": "StableDiffusionInpaintPipeline",
        "denoiser": "unet", "denoiser_class": "UNet2DConditionModel",
        "base_repo": "stable-diffusion-v1-5/stable-diffusion-v1-5",
        "pipeline_kwargs": NO_SAFETY_CHECKER,
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 64,
        "defaults": {"num_steps": 25, "guidance_scale": 7.0, "width": 512, "height": 512},
        "resolutions": _res(384, 1024),
        "fallback_params": {"unet": 0.86, "text_encoder": 0.12, "vae": 0.08},
    },
    # SD 1.5 with the 9 channel inpainting UNet (masked image + mask as extra input)
    "sd15_inpaint": {
        "family": "sd1", "label": "Stable Diffusion 1.5 Inpainting",
        "pipeline": "StableDiffusionInpaintPipeline", "img2img_pipeline": None,
        "inpaint_pipeline": "StableDiffusionInpaintPipeline", "inpaint_only": True,
        "denoiser": "unet", "denoiser_class": "UNet2DConditionModel",
        "base_repo": "stable-diffusion-v1-5/stable-diffusion-inpainting",
        "pipeline_kwargs": NO_SAFETY_CHECKER,
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 64,
        "defaults": {"num_steps": 25, "guidance_scale": 7.0, "width": 512, "height": 512},
        "resolutions": _res(384, 1024),
        "fallback_params": {"unet": 0.86, "text_encoder": 0.12, "vae": 0.08},
    },
    # SD 2.x (OpenCLIP text encoder); the 768 px models predict v, the 512 px "base" ones epsilon
    "sd21": {
        "family": "sd2", "label": "Stable Diffusion 2.x",
        "pipeline": "StableDiffusionPipeline", "img2img_pipeline": "StableDiffusionImg2ImgPipeline",
        "inpaint_pipeline": "StableDiffusionInpaintPipeline",
        "denoiser": "unet", "denoiser_class": "UNet2DConditionModel",
        "base_repo": "sd2-community/stable-diffusion-2-1",
        "pipeline_kwargs": NO_SAFETY_CHECKER,
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 64,
        "defaults": {"num_steps": 25, "guidance_scale": 7.0, "width": 768, "height": 768},
        "resolutions": _res(512, 1024),
        "fallback_params": {"unet": 0.87, "text_encoder": 0.34, "vae": 0.08},
    },
    "sd21_base": {
        "family": "sd2", "label": "Stable Diffusion 2.x (512)",
        "pipeline": "StableDiffusionPipeline", "img2img_pipeline": "StableDiffusionImg2ImgPipeline",
        "inpaint_pipeline": "StableDiffusionInpaintPipeline",
        "denoiser": "unet", "denoiser_class": "UNet2DConditionModel",
        "base_repo": "sd2-community/stable-diffusion-2-1-base",
        "pipeline_kwargs": NO_SAFETY_CHECKER,
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 64,
        "defaults": {"num_steps": 25, "guidance_scale": 7.0, "width": 512, "height": 512},
        "resolutions": _res(384, 1024),
        "fallback_params": {"unet": 0.87, "text_encoder": 0.34, "vae": 0.08},
    },
    "sdxl": {
        "family": "sdxl", "label": "Stable Diffusion XL",
        "pipeline": "StableDiffusionXLPipeline", "img2img_pipeline": "StableDiffusionXLImg2ImgPipeline",
        "inpaint_pipeline": "StableDiffusionXLInpaintPipeline",
        "denoiser": "unet", "denoiser_class": "UNet2DConditionModel",
        "base_repo": "stabilityai/stable-diffusion-xl-base-1.0",
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 64,
        "defaults": {"num_steps": 30, "guidance_scale": 6.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1536),
        "fallback_params": {"unet": 2.57, "text_encoder": 0.12, "text_encoder_2": 0.69, "vae": 0.08},
    },
    "sd35_medium": {
        "family": "sd3", "label": "Stable Diffusion 3.5 Medium",
        "pipeline": "StableDiffusion3Pipeline", "img2img_pipeline": "StableDiffusion3Img2ImgPipeline",
        "inpaint_pipeline": "StableDiffusion3InpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "SD3Transformer2DModel",
        "base_repo": "stabilityai/stable-diffusion-3.5-medium",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        "defaults": {"num_steps": 40, "guidance_scale": 4.5, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1440),
        "fallback_params": {"transformer": 2.47, "text_encoder": 0.12, "text_encoder_2": 0.69,
                            "text_encoder_3": 4.76, "vae": 0.08},
    },
    "sd35_large": {
        "family": "sd3", "label": "Stable Diffusion 3.5 Large",
        "pipeline": "StableDiffusion3Pipeline", "img2img_pipeline": "StableDiffusion3Img2ImgPipeline",
        "inpaint_pipeline": "StableDiffusion3InpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "SD3Transformer2DModel",
        "base_repo": "stabilityai/stable-diffusion-3.5-large",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        "defaults": {"num_steps": 28, "guidance_scale": 3.5, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1440),
        "fallback_params": {"transformer": 8.06, "text_encoder": 0.12, "text_encoder_2": 0.69,
                            "text_encoder_3": 4.76, "vae": 0.08},
    },
    "flux1_schnell": {
        "family": "flux1", "label": "FLUX.1 [schnell]",
        "pipeline": "FluxPipeline", "img2img_pipeline": "FluxImg2ImgPipeline",
        "inpaint_pipeline": "FluxInpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "FluxTransformer2DModel",
        "base_repo": "black-forest-labs/FLUX.1-schnell",
        "torch_dtype": "bfloat16", "fp16_compute": True, "negative_prompt": False, "size_multiple": 16,
        "defaults": {"num_steps": 4, "guidance_scale": 0.0, "width": 1024, "height": 1024},
        "call_kwargs": {"max_sequence_length": 256},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 11.9, "text_encoder": 0.12, "text_encoder_2": 4.76, "vae": 0.08},
    },
    "flux1_dev": {
        "family": "flux1", "label": "FLUX.1 [dev]",
        "pipeline": "FluxPipeline", "img2img_pipeline": "FluxImg2ImgPipeline",
        "inpaint_pipeline": "FluxInpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "FluxTransformer2DModel",
        "base_repo": "black-forest-labs/FLUX.1-dev", "gated": True,
        "torch_dtype": "bfloat16", "fp16_compute": True, "negative_prompt": False, "size_multiple": 16,
        "defaults": {"num_steps": 28, "guidance_scale": 3.5, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 11.9, "text_encoder": 0.12, "text_encoder_2": 4.76, "vae": 0.08},
    },
    # Chroma (lodestones, Apache 2.0): FLUX.1 [schnell] reworked to 8.9B, its modulation layers replaced by one
    # small network (distilled_guidance_layer); T5-XXL as the only text encoder (no CLIP), FLUX.1's VAE. Real
    # classifier-free guidance with a negative prompt (two passes per step). Chroma1-HD / -Base / -Flash and
    # their fine-tunes; distilled ones (Flash) get fewer steps without guidance (chroma_overrides)
    "chroma": {
        "family": "chroma", "label": "Chroma",
        "pipeline": "ChromaPipeline", "img2img_pipeline": "ChromaImg2ImgPipeline",
        "inpaint_pipeline": "ChromaInpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "ChromaTransformer2DModel",
        "base_repo": "lodestones/Chroma1-HD", "flash_base_repo": "lodestones/Chroma1-Flash",
        "license": "Apache 2.0",
        # float16 where bfloat16 is emulated (M1/M2), as for FLUX.1: the T5 encoder stays bfloat16
        "torch_dtype": "bfloat16", "fp16_compute": True, "negative_prompt": True, "size_multiple": 16,
        "defaults": {"num_steps": 30, "guidance_scale": 4.0, "width": 1024, "height": 1024,
                     # the model card's negative prompt
                     "negative_prompt": "low quality, ugly, unfinished, out of focus, deformed, disfigure, blurry, "
                                        "smudged, restricted palette, flat colors"},
        # T5 tokens of the prompt; the same for all three pipelines (the inpainting one would take 256)
        "call_kwargs": {"max_sequence_length": 512},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 8.9, "text_encoder": 4.76, "vae": 0.08},
    },
    "flux2_dev": {
        "family": "flux2", "label": "FLUX.2 [dev]",
        "pipeline": "Flux2Pipeline", "img2img_pipeline": None,
        "denoiser": "transformer", "denoiser_class": "Flux2Transformer2DModel",
        "base_repo": "black-forest-labs/FLUX.2-dev", "gated": True,
        "torch_dtype": "bfloat16", "negative_prompt": False, "size_multiple": 16,
        "defaults": {"num_steps": 50, "guidance_scale": 4.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 32.2, "text_encoder": 24.0, "vae": 0.08},
    },
    "flux2_klein": {
        "family": "flux2", "label": "FLUX.2 [klein]",
        "pipeline": "Flux2KleinPipeline", "img2img_pipeline": None,
        "denoiser": "transformer", "denoiser_class": "Flux2Transformer2DModel",
        "base_repo": "black-forest-labs/FLUX.2-klein-4B",
        "torch_dtype": "bfloat16", "negative_prompt": False, "size_multiple": 16,
        # distilled klein checkpoints are overridden to 4 steps in detect_from_model_index
        "defaults": {"num_steps": 50, "guidance_scale": 4.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 4.0, "text_encoder": 4.0, "vae": 0.08},
    },
    # Qwen-Image (Alibaba, Apache 2.0): 20B MMDiT, Qwen2.5-VL 7B text encoder, own VAE; also its 2512
    # update and fine-tunes. True classifier-free guidance (two passes per step, true_cfg_scale); the
    # pipeline only guides with a negative prompt, an empty one is passed as " " (empty_negative)
    "qwen_image": {
        "family": "qwen_image", "label": "Qwen-Image",
        "pipeline": "QwenImagePipeline", "img2img_pipeline": "QwenImageImg2ImgPipeline",
        "inpaint_pipeline": "QwenImageInpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "QwenImageTransformer2DModel",
        "base_repo": "Qwen/Qwen-Image",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        "guidance_param": "true_cfg_scale", "empty_negative": " ",
        "defaults": {"num_steps": 30, "guidance_scale": 4.0, "width": 1328, "height": 1328},
        # 1328 px squares and the model card's aspect ratios (16:9 1664x928, 4:3 1472x1104, 3:2 1584x1056)
        "resolutions": sorted(set(_res(512, 1664) + [928, 1056, 1104, 1328, 1584])),
        "fallback_params": {"transformer": 20.43, "text_encoder": 8.29, "vae": 0.13},
    },
    # Qwen-Image 2.1 (Qwen Research License, non-commercial): 7B single-stream transformer, Qwen3-VL 8B
    # text encoder, own 16x VAE. Generates and edits (an input picture is a reference, as with FLUX.2);
    # needs diffusers 0.41, and torchvision for the Qwen3-VL processor
    "qwen_image21": {
        "family": "qwen_image21", "label": "Qwen-Image 2.1",
        "pipeline": "QwenImage21Pipeline", "img2img_pipeline": None, "img2img": True, "image_reference": True,
        "denoiser": "transformer", "denoiser_class": "QwenImage21Transformer2DModel",
        "base_repo": "Qwen/Qwen-Image-2.1", "packages": {"diffusers": "0.41", "torchvision": "0.20"},
        "license": "Qwen Research License (non-commercial)",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 32,
        "guidance_param": "true_cfg_scale", "empty_negative": " ",
        # without guidance as the model card generates (true_cfg_scale 1); 2048 px is native, 1024 px
        # takes a quarter of the time
        "defaults": {"num_steps": 40, "guidance_scale": 1.0, "width": 1024, "height": 1024},
        "resolutions": sorted(set(_res(512, 2048) + [1696])),
        "fallback_params": {"transformer": 7.12, "text_encoder": 8.77, "vae": 0.34},
    },
    # Z-Image (Tongyi-MAI / Alibaba, Apache 2.0): 6.15B single-stream DiT (NextDiT: 30 layers, 3840 wide, two noise
    # and two caption refiner layers), Qwen3 4B as text encoder, FLUX.1's VAE (16 channels). Z-Image-Turbo is
    # distilled to 8 steps (9 scheduler steps) without guidance; Z-Image (Base) is undistilled: 28-50 steps with
    # real classifier-free guidance and a negative prompt (z_image_overrides). Guidance at or below 1 is "off" in
    # both runtimes (guidance_off_at: diffusers would guide with 0 < g <= 1, mflux does not)
    "z_image": {
        "family": "z_image", "label": "Z-Image",
        "pipeline": "ZImagePipeline", "img2img_pipeline": "ZImageImg2ImgPipeline",
        "inpaint_pipeline": "ZImageInpaintPipeline",
        "denoiser": "transformer", "denoiser_class": "ZImageTransformer2DModel",
        # the base parts of single files: the same Qwen3 encoder, tokenizer and VAE in both; the scheduler's
        # shift differs (Turbo 3, Base 6)
        "base_repo": "Tongyi-MAI/Z-Image-Turbo", "undistilled_base_repo": "Tongyi-MAI/Z-Image",
        "license": "Apache 2.0",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        "guidance_off_at": 1.0,
        # Turbo, as most Z-Image models are; Base gets more steps and guidance in z_image_overrides
        "defaults": {"num_steps": 9, "guidance_scale": 0.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 2048),
        "fallback_params": {"transformer": 6.15, "text_encoder": 4.02, "vae": 0.08},
    },
    # Krea 2 (13B transformer, Qwen3-VL text encoder, Qwen-Image VAE). diffusers can not load its
    # single-file checkpoints, so it runs with the MLX runtime (mflux reads Krea's own format)
    "krea2": {
        "family": "krea2", "label": "Krea 2",
        "pipeline": "Krea2Pipeline", "img2img_pipeline": None,
        "denoiser": "transformer", "denoiser_class": "Krea2Transformer2DModel",
        "base_repo": "krea/Krea-2-Turbo", "gated": True, "runtime": "mlx",
        "mlx_staged": True,  # 16 GB Macs: the text encoder is freed after encoding (engines/mlx STAGED_ARCHS)
        "native_file": "turbo.safetensors",  # where mflux expects the transformer (Krea format)
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        # Turbo (distilled); Raw checkpoints get more steps in name_overrides
        "defaults": {"num_steps": 8, "guidance_scale": 1.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 13.1, "text_encoder": 4.4, "vae": 0.13},
    },
    # Anima (CircleStone Labs / Comfy Org): Cosmos-Predict2 2B with an LLM adapter, Qwen3 0.6B text
    # encoder, Qwen-Image VAE. Neither diffusers (0.40) nor mflux runs it: the ComfyUI runtime does,
    # from the original files (layout "comfy_files": diffusion model, text encoder, VAE)
    "anima": {
        "family": "anima", "label": "Anima",
        "pipeline": None, "img2img_pipeline": None, "img2img": True,
        "denoiser": "transformer", "denoiser_class": None,
        "base_repo": "circlestone-labs/Anima", "runtime": "comfyui",
        "comfy": {"clip_type": "stable_diffusion", "sampler": "er_sde", "scheduler": "simple",
                  "base_files": {"text_encoder": "split_files/text_encoders/qwen_3_06b_base.safetensors",
                                 "vae": "split_files/vae/qwen_image_vae.safetensors"}},
        "license": "CircleStone Labs non-commercial licence",
        "prompt_hint": "Tags (Danbooru style) and/or sentences; prefix \"masterpiece, best quality, score_7, safe, \"",
        "torch_dtype": "bfloat16", "negative_prompt": True, "size_multiple": 16,
        "defaults": {"num_steps": 30, "guidance_scale": 4.0, "width": 1024, "height": 1024,
                     "negative_prompt": "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts"},
        "resolutions": _res(512, 1536),
        "fallback_params": {"transformer": 2.09, "text_encoder": 0.6, "vae": 0.13},
    },
    # Wan 2.2 TI2V 5B (Alibaba, Apache 2.0): video from a start picture, UMT5-XXL text encoder, Wan 2.2
    # VAE (16x compression). Runs on the ComfyUI runtime from Comfy-Org's repackaged files
    "wan22_ti2v": {
        "family": "wan", "label": "Wan 2.2 5B (video)", "kind": "video",
        "pipeline": None, "img2img_pipeline": None, "img2img": False,
        "denoiser": "transformer", "denoiser_class": None,
        "base_repo": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "runtime": "comfyui",
        "comfy": {"clip_type": "wan", "sampler": "uni_pc", "scheduler": "simple", "shift": 8.0,
                  "base_files": {"text_encoder": "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                                 "vae": "split_files/vae/wan2.2_vae.safetensors"}},
        "license": "Apache 2.0",
        "prompt_hint": "Describe the motion and the camera (\"she turns her head and smiles, slow dolly-in\")",
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 32,
        "defaults": {"num_steps": 30, "guidance_scale": 5.0, "width": 832, "height": 480,
                     "num_frames": 49, "fps": 24,
                     "negative_prompt": "static, blurry, low quality, jpeg artifacts, deformed, distorted, "
                                        "extra fingers, watermark, text, subtitles"},
        "resolutions": _res(320, 1280, 32),
        # the text encoder is 5.7B parameters in fp8: counted as 2.9B 16 bit equivalents
        "fallback_params": {"transformer": 5.0, "text_encoder": 2.9, "vae": 0.7},
    },
    # Wan 2.2 I2V A14B (Apache 2.0): two 14B experts, high noise for the first steps, low noise for the
    # rest, as 4 bit GGUF (ComfyUI-GGUF), each with the lightx2v distillation LoRA (4 steps, CFG 1)
    "wan22_i2v_14b": {
        "family": "wan", "label": "Wan 2.2 14B (video, 4 steps)", "kind": "video",
        "pipeline": None, "img2img_pipeline": None, "img2img": False,
        "denoiser": "transformer", "denoiser_class": None,
        "base_repo": "QuantStack/Wan2.2-I2V-A14B-GGUF", "runtime": "comfyui",
        "comfy": {"clip_type": "wan", "sampler": "euler", "scheduler": "simple", "shift": 5.0,
                  "base_files": {
                      "diffusion_model_low": "LowNoise/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf",
                      "lora_high": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged::split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
                      "lora_low": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged::split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
                      "text_encoder": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged::split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                      "vae": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged::split_files/vae/wan_2.1_vae.safetensors"}},
        "fixed_params": True,  # the header counts a 4 bit 14B model: keep the resident-size estimate below
        "user_loras": False,  # its two-stage workflow has no place for the user's LoRAs yet (high + low noise pairs)
        "license": "Apache 2.0",
        "prompt_hint": "Describe the motion and the camera (\"she turns her head and smiles, slow dolly-in\")",
        "torch_dtype": "float16", "negative_prompt": True, "size_multiple": 16,
        "defaults": {"num_steps": 4, "guidance_scale": 1.0, "width": 832, "height": 480,
                     "num_frames": 49, "fps": 16,
                     "negative_prompt": "static, blurry, low quality, jpeg artifacts, deformed, distorted, "
                                        "extra fingers, watermark, text, subtitles"},
        "resolutions": _res(320, 1280, 16),
        # one 4 bit expert (9.7 GB) plus its LoRA (1.2 GB) is resident at a time: counted as 16 bit equivalents
        "fallback_params": {"transformer": 5.4, "text_encoder": 2.9, "vae": 0.13},
    },
    # Ideogram 4 (two 9.3B transformers: conditional + unconditional for guidance, Qwen3-VL 8B text
    # encoder, FLUX.2 VAE). FP8 checkpoints; runs with the MLX runtime, mflux reads them as they are
    "ideogram4": {
        "family": "ideogram4", "label": "Ideogram 4",
        "pipeline": "Ideogram4Pipeline", "img2img_pipeline": None,
        "denoiser": "transformer", "denoiser_class": "Ideogram4Transformer2DModel",
        "base_repo": "ideogram-ai/ideogram-4-fp8", "gated": True, "runtime": "mlx",
        "mlx_staged": True,  # the text encoder may be freed after encoding (engines/mlx STAGED_ARCHS)
        # trained to refuse nudity / unsafe content: paints a "blocked by safety filter" card instead
        "content_filtered": True,
        # where mflux expects the two transformers (one FP8 file each, ComfyUI / Ideogram format)
        "native_files": {"transformer": "transformer/model.safetensors",
                         "unconditional_transformer": "unconditional_transformer/model.safetensors"},
        "torch_dtype": "bfloat16", "negative_prompt": False, "size_multiple": 16,
        # 20 steps = mflux preset V4_DEFAULT_20 (12 = V4_TURBO_12, 48 = V4_QUALITY_48); the guidance
        # schedule comes with the preset
        "defaults": {"num_steps": 20, "guidance_scale": 7.0, "width": 1024, "height": 1024},
        "resolutions": _res(512, 2048),
        "fallback_params": {"transformer": 9.28, "unconditional_transformer": 9.28, "text_encoder": 8.2, "vae": 0.08},
    },
}

def _version(text):
    return tuple(int(x) for x in re.findall(r"\d+", text)[:3])


def runtime_too_old(arch):
    """A message when the runtime lacks a package the architecture needs or has an older one ("packages":
    {name: minimum version}), else None. Installed runtimes keep their packages until they are updated."""
    from importlib.metadata import PackageNotFoundError, version
    for package, need in (ARCHS[arch].get("packages") or {}).items():
        try:
            have = version(package)
        except PackageNotFoundError:
            have = None
        if have is None or _version(have) < _version(need):
            return ("%s needs %s %s or newer, the Diffusers runtime has %s: update it in Settings → Runtimes "
                    "(Update)" % (ARCHS[arch]["label"], package, need, have or "none"))
    return None


def name_overrides(ref):
    """Default tweaks for well known distilled variants, derived from the repo / file name."""
    r = (ref or "").lower()
    if "sdxl-turbo" in r or "sdxl_turbo" in r:
        return {"num_steps": 4, "guidance_scale": 0.0, "width": 512, "height": 512}
    if "turbo" in r or "lightning" in r or "hyper" in r:
        return {"num_steps": 4, "guidance_scale": 0.0}
    return {}


def detect_from_model_index(model_index, denoiser_config=None, ref="", scheduler_config=None):
    """Returns (arch, default_overrides) for a diffusers repo / folder (scheduler_config: where the scheduler tells
    a model's version, as Z-Image's shift does)."""
    cls = model_index.get("_class_name", "")
    denoiser_config = denoiser_config or {}
    overrides = name_overrides(ref)

    if cls in ("StableDiffusionPipeline", "StableDiffusionImg2ImgPipeline", "StableDiffusionInpaintPipeline"):
        unet = denoiser_config or {}
        if unet.get("in_channels") == 9 or cls == "StableDiffusionInpaintPipeline":
            return "sd15_inpaint", overrides
        if unet.get("cross_attention_dim") == 1024:  # OpenCLIP: SD 2.x
            return ("sd21" if unet.get("sample_size", 64) >= 96 else "sd21_base"), overrides
        return "sd15", overrides
    if cls == "StableDiffusionXLPipeline":
        return "sdxl", overrides
    if cls == "StableDiffusion3Pipeline":
        arch = "sd35_large" if denoiser_config.get("num_layers", 24) >= 30 else "sd35_medium"
        return arch, overrides
    if cls == "FluxPipeline":
        arch = "flux1_dev" if denoiser_config.get("guidance_embeds", False) else "flux1_schnell"
        return arch, overrides
    if cls in ("ChromaPipeline", "ChromaImg2ImgPipeline", "ChromaInpaintPipeline"):
        return "chroma", chroma_overrides(ref, overrides)
    if cls.startswith("Chroma"):
        raise UnsupportedModel(CHROMA_OTHERS % cls)
    if cls == "Flux2Pipeline":
        return "flux2_dev", overrides
    if cls == "Ideogram4Pipeline":
        return "ideogram4", {}
    if cls == "Krea2Pipeline":
        return "krea2", {}  # the generic "turbo" rule (4 steps, no guidance) does not fit Krea 2
    if cls == "Flux2KleinPipeline":
        if model_index.get("is_distilled"):
            overrides = {"num_steps": 4, "guidance_scale": 1.0, **overrides}
        return "flux2_klein", overrides
    if cls in ("QwenImagePipeline", "QwenImageImg2ImgPipeline", "QwenImageInpaintPipeline"):
        return "qwen_image", _qwen_overrides(ref, overrides)
    if cls == "QwenImage21Pipeline":
        return "qwen_image21", _qwen_overrides(ref, overrides)
    if cls.startswith("QwenImage"):
        raise UnsupportedModel("Of the Qwen-Image models Qwen-Image (and its fine-tunes) and Qwen-Image 2.1 are "
                               "supported, not %s" % cls)
    if cls in ("ZImagePipeline", "ZImageImg2ImgPipeline", "ZImageInpaintPipeline"):
        if denoiser_config.get("siglip_feat_dim"):
            raise UnsupportedModel(Z_IMAGE_OTHERS % "Z-Image Omni")
        return "z_image", z_image_overrides(ref, shift=(scheduler_config or {}).get("shift"))
    if cls.startswith("ZImage"):
        raise UnsupportedModel(Z_IMAGE_OTHERS % cls)
    raise UnsupportedModel("Unsupported pipeline type: %s" % (cls or "unknown"))


Z_IMAGE_OTHERS = ("Of the Z-Image models Z-Image-Turbo, Z-Image (Base) and their fine-tunes are supported, not %s "
                  "(the edit and omni versions take a reference picture with their own pipelines)")

# Z-Image (Base) by name: Tongyi-MAI/Z-Image itself, "Z-Image Base" / Civitai's "ZImageBase", the short "ZIB"
_Z_IMAGE_BASE = re.compile(r"tongyi-mai/z-image(/|$)|z[-_ ]?image[-_ ]?base|(^|[^a-z])zib([^a-z]|$)")
# distilled: Turbo ("ZIT"), distilled fine-tunes of the base ("ZID", "zibDistilled") and few-step merges
_Z_IMAGE_DISTILLED = re.compile(r"turbo|(^|[^a-z])zi[td]([^a-z]|$)|distill")
Z_IMAGE_BASE_DEFAULTS = {"num_steps": 30, "guidance_scale": 4.0}


def is_z_image_base(ref, shift=None):
    """Z-Image (Base) or a fine-tune of it, undistilled: from its name, or the scheduler of a diffusers folder (Base
    shifts by 6, Turbo by 3). Names of distilled models win; without a word for either it is Turbo, as most are."""
    r = (ref or "").lower()
    if _Z_IMAGE_DISTILLED.search(r):
        return False
    if _Z_IMAGE_BASE.search(r):
        return True
    return shift is not None and float(shift) >= 5


def z_image_overrides(ref, shift=None):
    """Defaults of a Z-Image model: Turbo (the architecture's: 9 steps, no guidance) or Base (30 steps, guidance 4).
    Not the generic "turbo" rule (4 steps)."""
    return dict(Z_IMAGE_BASE_DEFAULTS) if is_z_image_base(ref, shift) else {}


def is_z_image(shapes):
    """A Z-Image transformer (original or diffusers names, any prefix): NextDiT layers with noise and caption
    refiners, a caption embedder and 3840 wide (Lumina 2, the same design, is 2304 wide)."""
    return _next_dit_width(shapes) == 3840


def _next_dit_width(shapes):
    keys = _strip(shapes.keys())
    if not (any(k.startswith("noise_refiner.") for k in keys) and any(k.startswith("context_refiner.") for k in keys)
            and any(k.startswith("cap_embedder.") for k in keys) and any(k.startswith("layers.") for k in keys)):
        return None
    # x_embedder (all_x_embedder.2-1 in diffusers' names) maps the patches to the model's width; GGUF lists the
    # dimensions the other way round: the larger one is the width
    for k, v in shapes.items():
        if re.search(r"(^|\.)(all_)?x_embedder(\.2-1)?\.weight$", k) and len(v) == 2:
            return max(int(x) for x in v)
    # without the input layer: the width of the layers' attention output
    for k, v in shapes.items():
        if re.search(r"(^|\.)layers\.\d+\.attention\.(out|to_out\.0)\.weight$", k) and len(v) == 2:
            return max(int(x) for x in v)
    return 0


def _qwen_overrides(ref, overrides):
    """Qwen-Image distilled to few steps (Lightning, turbo) runs without guidance; true_cfg_scale 1 (not the
    generic 0) is "off" for these pipelines."""
    if overrides.get("guidance_scale") == 0.0:
        overrides = dict(overrides, guidance_scale=1.0)
    if re.search(r"(^|[^a-z])edit", (ref or "").lower().rsplit("/", 1)[-1]):
        raise UnsupportedModel("Qwen-Image-Edit is not supported: it edits pictures with its own pipeline. "
                               "Qwen-Image and Qwen-Image 2.1 (which also edits) are")
    return overrides


CHROMA_OTHERS = ("Of the Chroma models Chroma (Chroma1-HD, -Base, -Flash and their fine-tunes) is supported, not %s "
                 "(Chroma Radiance paints in pixel space, without a VAE)")


def is_chroma_flash(ref):
    """Chroma1-Flash and its fine-tunes: distilled to few steps without guidance (its name tells)."""
    return bool(re.search(r"flash", (ref or "").lower()))


def chroma_overrides(ref, overrides=None):
    """Chroma's distilled versions (Flash; turbo / Lightning / Hyper merges) run without guidance; for its
    pipelines guidance 1 (not the generic 0) is "off"."""
    overrides = dict(name_overrides(ref) if overrides is None else overrides)
    if is_chroma_flash(ref):
        overrides = {"num_steps": 12, "guidance_scale": 1.0, **overrides}
    if overrides.get("guidance_scale") == 0.0:
        overrides["guidance_scale"] = 1.0
    if overrides.get("guidance_scale") == 1.0:
        overrides.setdefault("negative_prompt", "")  # without guidance the negative prompt is not used
    return overrides


# ---------------------------------------------------------------- single files

MAX_HEADER_BYTES = 100 * 1024 * 1024


def read_safetensors_json(path):
    """The raw JSON header of a safetensors file (tensor entries and "__metadata__")."""
    with open(path, "rb") as f:
        head = f.read(8)
        n = struct.unpack("<Q", head)[0] if len(head) == 8 else 0
        if not 0 < n <= MAX_HEADER_BYTES:
            raise UnsupportedModel("Not a valid safetensors file")
        header = json.loads(f.read(n))
    if not isinstance(header, dict):
        raise UnsupportedModel("Not a valid safetensors file")
    return header


def read_safetensors_header(path):
    """{tensor_name: shape} without loading tensors (works for bf16/fp8 too)."""
    return _shapes(read_safetensors_json(path))


def _shapes(header):
    return {k: v["shape"] for k, v in header.items() if k != "__metadata__"}


def read_safetensors_metadata(path):
    return read_safetensors_json(path).get("__metadata__") or {}


# ".lora.down." / ".lora.up.": older diffusers format (also written by the SDXL trainer)
LORA_MARKERS = (".lora_A.", ".lora_B.", ".lora_down.", ".lora_up.", ".lora.down.", ".lora.up.", "lora_unet_", "lora_te",
                ".lokr_", ".hada_")


def is_lora(keys):
    return any(m in k for k in keys for m in LORA_MARKERS)


def _made_up(word):
    """Trigger tokens are invented words (t4tt00, br33zy, proto_tat), not English."""
    return bool(re.search(r"\d|_", word)) and bool(re.search(r"[a-z]", word, re.I)) \
        and not re.fullmatch(r"\d+\+?(boy|girl|other)s?|\d+(k|d|s|th|st|nd|rd|mm)", word, re.I)


def _instance_tokens(meta):
    """kohya's dataset folders are named "<repeats>_<instance token> <class>" ("25_Tattoo_gen Style"):
    the instance token is the trigger word the LoRA was trained for."""
    try:
        dirs = json.loads(meta.get("ss_dataset_dirs") or "{}")
    except ValueError:
        return []
    out = []
    for d in dirs:
        m = re.match(r"^\d+_(.+)$", os.path.basename(str(d)).strip())
        if not m:
            continue
        words = m.group(1).split()
        token = " ".join(words[:-1]) if len(words) > 1 else words[0]
        if _made_up(token.replace(" ", "_")) and token.lower() not in [o.lower() for o in out]:
            out.append(token)
    return out


def trigger_words_from_metadata(meta):
    """Trigger words of a LoRA from its kohya training metadata (ss_tag_frequency):

    - instance-token LoRAs (a handful of tags): those tags
    - captioned datasets: the invented token most captions start with ("t4tt00 black and white …")
    - tagged datasets: invented tags used for many images ("proto_tat", "tattoo_style")
    General dataset tags ("monochrome", "solo") are no trigger words and stay out of the prompt."""
    try:
        tags = {}
        for folder in json.loads(meta.get("ss_tag_frequency") or "{}").values():
            for tag, n in folder.items():
                tags[tag.strip()] = tags.get(tag.strip(), 0) + n
    except (ValueError, AttributeError):
        return []
    tags.pop("", None)
    ranked = [t for t, _ in sorted(tags.items(), key=lambda x: -x[1])]
    if 0 < len(tags) <= 3:
        return ranked
    out = _instance_tokens(meta)
    captions = [t for t in ranked if len(t.split()) >= 4]
    if captions:
        # kohya splits captions at commas, so the fragments count too: a fifth is plenty
        firsts = [c.split()[0].strip(".,:;").lower() for c in captions]
        firsts = [w for w in firsts if _made_up(w)]
        if firsts:
            first = max(set(firsts), key=firsts.count)
            if firsts.count(first) >= max(2, len(captions) / 5) and first not in [o.lower() for o in out]:
                out.append(first)
    top = max(tags.values()) if tags else 0
    out += [t for t in ranked if len(t.split()) == 1 and _made_up(t) and tags[t] >= top / 10 and t not in out]
    return out[:3]


# ---------------------------------------------------------------- which model a LoRA is for
#
# Precedence (a LoRA's family decides which models it is offered for):
#   1. its structure: layer names after the trainers' prefixes are taken off, block counts and widths
#   2. what its metadata says, from a table of known values (ai-toolkit's default "sd_1.5" and the
#      "stable-diffusion-*" values of modelspec.architecture are not trusted: both were found wrong)
#   3. what its source says (Civitai's base model, the base_model tag of a Hugging Face repository)
#   4. nothing more: no guess. A file that none of these tell is refused.
# When the structure leaves a choice (a FLUX.1 LoRA without modulation layers fits Chroma as well),
# 2 and 3 choose among the candidates. When the file and the source disagree, the file wins and both
# are kept (hint_mismatch).

# families of LoRAs no installed model type can use yet: recognised, so that they are offered for no model
# (their import labels end in NO_RUNTIME_LABEL; recheck.py takes it off when the family becomes runnable)
NO_RUNTIME_LABEL = ": no model type of the app can use it yet"
FOREIGN_FAMILIES = {
    "lumina": "Lumina 2", "ernie": "ERNIE-Image", "hidream": "HiDream",
    "hidream_o1": "HiDream-O1", "hunyuan_video": "HunyuanVideo", "hunyuan_dit": "Hunyuan-DiT", "auraflow": "AuraFlow",
}

# sub-bases inside a family whose LoRAs do not fit each other (other widths)
VARIANT_LABELS = {"klein4b": "FLUX.2 [klein] 4B", "klein9b": "FLUX.2 [klein] 9B", "dev": "FLUX.2 [dev]",
                  "5b": "Wan 2.2 5B", "14b": "Wan 14B", "1.3b": "Wan 1.3B"}

# metadata values -> (family, variant); matched on the lower-case value from its start
_META_FAMILIES = [
    (r"^flux[-_. ]?2[-_. ]?klein[-_. ]?(base[-_. ]?)?9b", "flux2", "klein9b"),
    (r"^flux[-_. ]?2[-_. ]?klein[-_. ]?(base[-_. ]?)?4b", "flux2", "klein4b"),
    (r"^flux[-_. ]?2[-_. ]?dev\b", "flux2", "dev"),
    (r"^flux[-_. ]?2\b", "flux2", None),
    # mflux names FLUX.1 Krea "krea-dev" / "dev-krea": FLUX.1, not Krea 2
    (r"^flux[-_. ]?1\b|^flux\b|^(dev|schnell|krea-dev|dev-krea|kontext|kontext-dev)$", "flux1", None),
    (r"^chroma\b", "chroma", None),
    # ai-toolkit calls Qwen-Image 2.x "qwen_image_2" (not the 2512 update of Qwen-Image)
    (r"^qwen[-_ ]?image[-_ ]?2(\.1|_1)?$|^qwen[-_ ]?image[-_ ]?2\.1\b|^qwen[-_ ]?image[-_ ]?2[-_]1\b|^qwen[-_ ]?image[-_ ]?2/", "qwen_image21", None),
    (r"^qwen", "qwen_image", None),
    (r"^krea[-_ ]?2\b", "krea2", None),
    (r"^anima\b", "anima", None),
    (r"^ideogram[-_ ]?4", "ideogram4", None),
    (r"^wan\b.*?\b(ti2v[-_ ]?)?5b\b|^wan[-_ .]?2[._]?2[-_ ]5b\b", "wan", "5b"),
    (r"^wan.*14b", "wan", "14b"),
    (r"^wan.*1[._]3b", "wan", "1.3b"),
    (r"^wan", "wan", None),
    (r"^z[-_ ]?image", "z_image", None),
    (r"^hidream[-_ ]?o1", "hidream_o1", None),
    (r"^hidream", "hidream", None),
    (r"^hunyuan[-_ ]?video", "hunyuan_video", None),
    (r"^hunyuan[-_ ]?dit", "hunyuan_dit", None),
    (r"^lumina", "lumina", None),
    (r"^ernie", "ernie", None),
    (r"^aura[-_ ]?flow", "auraflow", None),
    (r"^sd[-_ ]?3|^stable-diffusion-v?3", "sd3", None),
    (r"^sdxl|^stable-diffusion-xl", "sdxl", None),
    (r"^sd[-_ ]?v?2\b|^sd[-_ ]?v?2[-_.]|^stable-diffusion-v2", "sd2", None),
    (r"^sd[-_ ]?v?1\b|^sd[-_ ]?v?1[-_.]|^stable-diffusion-v1", "sd1", None),
]


def family_of_base(text):
    """(family, variant) for a base model's name as trainers write it, or (None, None)."""
    t = (text or "").strip().lower()
    for pattern, family, variant in _META_FAMILIES:
        if t and re.search(pattern, t):
            return family, variant
    return None, None


# Hugging Face repositories LoRAs name as their base (base_model in the model card) -> (family, variant)
_REPO_FAMILIES = [
    (r"black-forest-labs/flux\.2-klein-(base-)?9b", "flux2", "klein9b"),
    (r"black-forest-labs/flux\.2-klein-(base-)?4b", "flux2", "klein4b"),
    (r"black-forest-labs/flux\.2-dev", "flux2", "dev"),
    (r"black-forest-labs/flux\.1-", "flux1", None),
    (r"^lodestones/chroma", "chroma", None),
    (r"^qwen/qwen-image-2\.1", "qwen_image21", None),
    (r"^qwen/qwen-image(-2512)?$", "qwen_image", None),
    (r"^krea/krea-2", "krea2", None),
    (r"^circlestone-labs/anima", "anima", None),
    (r"^ideogram-ai/ideogram-4", "ideogram4", None),
    (r"^wan-ai/wan2\.2-ti2v-5b", "wan", "5b"),
    (r"^wan-ai/wan2\.[12]-.*14b", "wan", "14b"),
    (r"^wan-ai/wan2\.1-.*1\.3b", "wan", "1.3b"),
    (r"^tongyi-mai/z-image", "z_image", None),
    (r"^hidream-ai/hidream-o1", "hidream_o1", None),
    (r"^hidream-ai/hidream-i1", "hidream", None),
    (r"hunyuanvideo", "hunyuan_video", None),
    (r"^tencent/hunyuan-?dit", "hunyuan_dit", None),
    (r"^alpha-vllm/lumina", "lumina", None),
    (r"^fal/auraflow|/pony-v7", "auraflow", None),
    (r"^stabilityai/stable-diffusion-3", "sd3", None),
    (r"^stabilityai/(stable-diffusion-xl|sdxl)|illustrious-xl|noobai-xl|/pony-diffusion-v6", "sdxl", None),
    (r"stable-diffusion-2", "sd2", None),
    (r"stable-diffusion-v1-5|^compvis/stable-diffusion-v1", "sd1", None),
]


def family_of_repo(repo):
    """(family, variant) of LoRAs for a Hugging Face base model repository, or (None, None)."""
    r = (repo or "").strip().lower()
    for pattern, family, variant in _REPO_FAMILIES:
        if r and re.search(pattern, r):
            return family, variant
    return None, None


def _software(meta):
    try:
        return (json.loads(meta.get("software") or "{}").get("name") or "").lower()
    except (ValueError, AttributeError):
        return ""


def _family_from_metadata(meta):
    """(family, variant, value) from the trainers' metadata, or (None, None, base text)."""
    software = _software(meta)
    first = ""
    for field in ("ss_base_model_version", "model", "modelspec.architecture"):
        value = str(meta.get(field) or "").strip()
        if not value:
            continue
        first = first or value.lower()
        low = value.lower()
        if field == "ss_base_model_version" and software == "ai-toolkit" and low in ("sd_1.5", "sd1.5", "sd_v1"):
            continue  # ai-toolkit's default for models it has no name for (written for FLUX.1, HiDream …)
        if field == "modelspec.architecture" and low.startswith("stable-diffusion"):
            continue  # kohya forks write SD 1 / SDXL here for Anima and Hunyuan-DiT LoRAs
        family, variant = family_of_base(low)
        if family:
            return family, variant, low
    return None, None, first


_TE_PREFIXES = ("lora_te", "text_encoder", "te1.", "te2.", "te.", "text_encoders.", "lora_te1_", "lora_te2_",
                "conditioner.")
_MODEL_PREFIXES = ("base_model.model.", "model.diffusion_model.", "diffusion_model.", "transformer.", "unet.", "net.",
                   "lycoris_", "lora_unet_", "lora_transformer_")
_SUFFIX = re.compile(r"\.(lora_[ab](\.default)?\.(weight|bias)|lora_(down|up)\.(weight|bias)|lora\.(down|up)\.weight|"
                     r"alpha|dora_scale|lora_magnitude_vector(\.default)?(\.weight)?|lokr_w[12](_[ab])?|lokr_t[12]|"
                     r"hada_w[12]_[ab]|hada_t[12]|diff|diff_b)$", re.I)
_DOWN = re.compile(r"\.(lora_a(\.default)?\.weight|lora_down\.weight|lora\.down\.weight)$", re.I)
_UP = re.compile(r"\.(lora_b(\.default)?\.weight|lora_up\.weight|lora\.up\.weight)$", re.I)


class _Layers:
    """A LoRA's layers in one spelling: lower case, "_" between all parts, trainers' prefixes and the
    LoRA suffixes taken off; with the in / out widths its matrices tell."""

    def __init__(self, shapes):
        self.mods, self.te = {}, {}
        for key, shape in shapes.items():
            m = _SUFFIX.search(key)
            low = (key[:m.start()] if m else key).lower()
            if low.startswith(_TE_PREFIXES):
                target = self.te
            else:
                target = self.mods
                for p in _MODEL_PREFIXES:
                    if low.startswith(p):
                        low = low[len(p):]
                        break
            info = target.setdefault(low.replace(".", "_"), {"in": None, "out": None})
            if _DOWN.search(key) and len(shape) >= 2:
                info["in"] = int(shape[1])  # linear [rank, in], conv [rank, in, k, k]
            elif _UP.search(key) and len(shape) >= 2:
                info["out"] = int(shape[0])

    def has(self, pattern):
        r = re.compile(pattern)
        return any(r.search(n) for n in self.mods)

    def blocks(self, pattern):
        r = re.compile(pattern)
        out = set()
        for n in self.mods:
            m = r.match(n)
            if m:
                out.add(int(m.group(1)))
        return out

    def width(self, pattern, side="in"):
        """The most common in (or out) width of the layers the pattern finds."""
        r = re.compile(pattern)
        seen = {}
        for n, info in self.mods.items():
            if r.search(n) and info[side]:
                seen[info[side]] = seen.get(info[side], 0) + 1
        return max(seen, key=seen.get) if seen else None


def _flux_like(L):
    """FLUX.1 / Chroma / FLUX.2 / HunyuanVideo in original (double_blocks) or diffusers names.
    Returns (family, variant, candidates) or None."""
    dbl, sgl = L.blocks(r"^double_blocks_(\d+)_"), L.blocks(r"^single_blocks_(\d+)_")
    tb, stb = L.blocks(r"^transformer_blocks_(\d+)_"), L.blocks(r"^single_transformer_blocks_(\d+)_")
    if not (dbl or sgl or stb):
        return None
    # HunyuanVideo (original names): fc1/fc2 MLPs, modulation "linear", token refiner; diffusers names: 20 / 40 blocks
    if L.has(r"_img_mlp_fc[12]$|_img_mod_linear$|individual_token_refiner") or \
            (stb and (max(tb or {0}) >= 19 or max(stb) >= 38)):
        return "hunyuan_video", None, ()
    flux2 = L.has(r"single_stream_modulation|double_stream_modulation|_to_qkv_mlp_proj$|_ff(_context)?_linear_(in|out)$")
    hidden = L.width(r"^(double_blocks_\d+_(img|txt)_attn_(qkv|proj)|single_blocks_\d+_linear1|"
                     r"(single_)?transformer_blocks_\d+_attn_(to_q|to_k|to_v|add_q_proj|to_qkv_mlp_proj))$")
    if hidden == 6144:
        return "flux2", "dev", ()
    if hidden == 4096:
        return "flux2", "klein9b", ()
    # 3072 wide: FLUX.1 / Chroma or FLUX.2 [klein] 4B. Their MLPs differ (GELU 4x against SwiGLU 3x)
    mlp_in = L.width(r"^(single_blocks_\d+_linear2|single_transformer_blocks_\d+_(proj_out|attn_to_out))$")
    mlp2_in = L.width(r"^(double_blocks_\d+_(img|txt)_mlp_2|transformer_blocks_\d+_ff(_context)?_(net_2|linear_out))$")
    if mlp_in == 12288 or mlp2_in == 9216:
        flux2 = True
    elif mlp_in == 15360 or mlp2_in == 12288:
        flux2 = False
    elif not flux2 and (max(dbl | tb or {0}) >= 5 or max(sgl | stb or {0}) >= 20):
        flux2 = False  # [klein] 4B has 5 double and 20 single blocks
    elif not flux2:
        if hidden == 3072 or hidden is None:
            return "flux1", None, ("flux1", "chroma", "flux2")
    if flux2:
        return "flux2", ("klein4b" if hidden == 3072 else None), ()
    if L.has(r"distilled_guidance_layer"):
        return "chroma", None, ()
    # Chroma has no modulation layers per block: a LoRA with them is FLUX.1, one without fits both
    if L.has(r"_(img|txt)_mod_lin$|_modulation_lin$|_norm1(_context)?_linear$|_norm_linear$"):
        return "flux1", None, ()
    return "flux1", None, ("flux1", "chroma")


def _transformer_blocks_only(L):
    """transformer_blocks without single blocks: Qwen-Image (60 blocks, 3072), Qwen-Image 2.1 (32, 4096),
    SD 3.5 (1536 / 2432), FLUX.2 or FLUX.1 trained on their double blocks only."""
    tb = L.blocks(r"^transformer_blocks_(\d+)_")
    if not tb:
        return None
    if L.has(r"^transformer_blocks_\d+_(img|txt)_mod_\d+$|^transformer_blocks_\d+_txt_mlp_|_img_mlp_net_"):
        return "qwen_image", None, ()
    if L.has(r"_img_mlp_(gate_layer|gate_up|proj)$") or L.has(r"^modulation_\d+$"):
        return "qwen_image21", None, ()
    hidden = L.width(r"^transformer_blocks_\d+_attn_(to_q|to_k|to_v|add_q_proj)$")
    if hidden in (1536, 2432):
        return "sd3", None, ()
    if L.has(r"_ff(_context)?_linear_(in|out)$"):
        return "flux2", {3072: "klein4b", 4096: "klein9b", 6144: "dev"}.get(hidden), ()
    n = max(tb) + 1
    if hidden == 4096:
        return ("qwen_image21", None, ()) if n > 8 else ("flux2", "klein9b", ("flux2", "qwen_image21"))
    if hidden == 6144:
        return "flux2", "dev", ()
    if n > 20:
        return "qwen_image", None, ()
    return None, None, ("flux1", "qwen_image", "qwen_image21", "flux2", "sd3", "hunyuan_video")


def _unet_family(L, te):
    """sd1 / sd2 / sdxl for a UNet LoRA: the cross attention reads the text encoder's width (768 SD 1.x,
    1024 SD 2.x, 2048 SDXL); then the text encoder parts; then the block layout."""
    ctx = L.width(r"_attn2_to_k$")
    if ctx:
        return {768: "sd1", 1024: "sd2", 2048: "sdxl"}.get(ctx), None, ()
    if any(n.startswith(("lora_te1_", "lora_te2_")) for n in te):
        return "sdxl", None, ()
    widths = [i["in"] for n, i in te.items() if n.startswith("lora_te_") and i["in"]]
    te_width = max(set(widths), key=widths.count) if widths else None  # the attention width is the common one
    if te_width:
        return {768: "sd1", 1024: "sd2"}.get(te_width), None, ()
    # SDXL has attention only from the second stage on and up to 10 transformer blocks in one
    if L.has(r"_transformer_blocks_[1-9]_"):
        return "sdxl", None, ()
    if L.has(r"^down_blocks_0_attentions_|^input_blocks_[12]_1_"):
        return None, None, ("sd1", "sd2")
    return None, None, ("sd1", "sd2", "sdxl")


def _structure(L, te):
    """(family, variant, candidates) from the layers; family None with candidates: one of these;
    None: the layers do not tell."""
    if L.has(r"adaln_modulation_(cross_attn|self_attn|mlp)|llm_adapter") or \
            L.has(r"^blocks_\d+_(self|cross)_attn_(q|k|v|output)_proj$|^blocks_\d+_mlp_layer[12]$"):
        return "anima", None, ()  # Cosmos-Predict2 blocks; kohya names them lora_unet_ like a UNet
    if L.has(r"txtfusion|text_fusion|txtmlp|_attn_to_gate$|^blocks_\d+_attn_(wq|wk|wv|wo|gate)$|^blocks_\d+_mod_lin$"):
        return "krea2", None, ()
    if L.has(r"^blocks_\d+_(self_attn|cross_attn)_[qkvo]$|^blocks_\d+_ffn_[02]$"):
        width = L.width(r"^blocks_\d+_(self_attn|cross_attn)_[qkv]$")
        return "wan", {1536: "1.3b", 3072: "5b", 5120: "14b"}.get(width), ()
    if L.has(r"^(double|single)_stream_blocks_\d+_"):
        return "hidream", None, ()
    if L.has(r"^language_model_layers_\d+_|^x_embedder_proj[12]$"):
        return "hidream_o1", None, ()
    if L.has(r"^(double|single)_layers_\d+_|^joint_transformer_blocks_\d+_"):
        return "auraflow", None, ()
    if L.has(r"^blocks_\d+_attn[12]_(wqkv|out_proj|kv_proj|q_proj)$|^blocks_\d+_default_modulation"):
        return "hunyuan_dit", None, ()
    if L.has(r"^layers_\d+_self_attention_|^layers_\d+_mlp_(gate_proj|up_proj|linear_fc[12])$"):
        return "ernie", None, ()
    if L.has(r"^(layers|context_refiner|noise_refiner)_\d+_(attention|feed_forward)_"):
        # NextDiT: Z-Image (3840 wide), Lumina 2 (2304), Ideogram 4 (4608, its attention output is "o")
        width = L.width(r"_(attention_(qkv|to_q|to_k|to_v)|feed_forward_w[13])$")
        if L.has(r"^layers_\d+_attention_o$") or width == 4608 or L.has(r"llm_cond_proj"):
            return "ideogram4", None, ()
        if width == 3840:
            return "z_image", None, ()
        if width == 2304:
            return "lumina", None, ()
        return None, None, ("z_image", "lumina", "ideogram4")
    if L.has(r"^joint_blocks_\d+_"):
        return "sd3", None, ()
    flux = _flux_like(L)
    if flux:
        return flux
    qwen = _transformer_blocks_only(L)
    if qwen:
        return qwen
    if L.has(r"^(down_blocks|up_blocks|mid_block|input_blocks|output_blocks|middle_block)_"):
        return _unet_family(L, te)
    if te and not L.mods:
        # text encoder only: SD and SDXL LoRAs have such files, FLUX.1 and SD 3 LoRAs too (CLIP)
        return _unet_family(L, te)[0], None, ("sd1", "sd2", "sdxl", "flux1", "sd3")
    return None


def lora_identity(shapes, meta=None, family_hint=None):
    """Which model family (and sub-base) a LoRA is for, from its tensor shapes and metadata.

    family_hint: what the source says, a family name or {"family", "variant", "source", "base"}.
    Returns {"family", "variant", "base", "detected_by"} plus "hint" and "hint_mismatch" when a hint
    was given. Raises UnsupportedModel when nothing tells."""
    meta = meta or {}
    hint = family_hint if isinstance(family_hint, dict) else ({"family": family_hint} if family_hint else None)
    hint_family = (hint or {}).get("family")
    L = _Layers(shapes)
    found = _structure(L, L.te)
    meta_family, meta_variant, base = _family_from_metadata(meta)
    if found is None:
        # the layers do not tell at all: the metadata, then the source
        if not (meta_family or hint_family):
            raise UnsupportedModel("Could not tell which model this LoRA was trained for: its layers match no "
                                   "known model type, and neither its metadata nor its source names one")
        family, variant, by = (meta_family, None, "metadata") if meta_family else (hint_family, None, "source")
    else:
        family, variant, candidates = found
        by = "structure"
        if candidates:
            # the layers leave a choice: the metadata, then the source choose; else the first candidate
            choice = next(((src, f) for src, f in (("metadata", meta_family), ("source", hint_family))
                           if f and f in candidates), None)
            if choice:
                if choice[1] != family:
                    variant = None
                by, family = choice
            elif family is None:
                raise UnsupportedModel("Could not tell which model this LoRA was trained for: its layers fit %s, "
                                       "and neither its metadata nor its source says which"
                                       % " or ".join(_family_name(c) for c in candidates))
    if not variant:
        if meta_family == family and meta_variant:
            variant = meta_variant
        elif hint and hint_family == family and hint.get("variant"):
            variant = hint["variant"]
    out = {"family": family, "variant": variant, "base": base, "detected_by": by}
    if hint_family:
        out["hint"] = {k: v for k, v in hint.items() if v}
        out["hint_mismatch"] = hint_family != family or bool(hint.get("variant") and variant
                                                              and hint["variant"] != variant)
    return out


def _family_name(family):
    for spec in ARCHS.values():
        if spec["family"] == family:
            return {"sd1": "SD 1.x", "sd2": "SD 2.x", "sd3": "SD 3.5", "flux1": "FLUX.1", "flux2": "FLUX.2",
                    "qwen_image": "Qwen-Image", "qwen_image21": "Qwen-Image 2.1"}.get(family, spec["label"])
    return FOREIGN_FAMILIES.get(family, family)


def family_label(family, variant=None):
    """The name of a LoRA family (and sub-base) for messages."""
    return VARIANT_LABELS.get(variant) or _family_name(family)


def inspect_lora(path, family_hint=None):
    """Which model family a LoRA file belongs to (lora_identity), plus its trigger words and size.

    family_hint: what the source says (Civitai's base model, a Hugging Face base_model tag), a family
    name or {"family", "variant", "source", "base"}."""
    header = read_safetensors_json(path)
    shapes, meta = _shapes(header), header.get("__metadata__") or {}
    if not is_lora(_strip(shapes.keys())):
        raise UnsupportedModel("Not a LoRA file")
    out = lora_identity(shapes, meta, family_hint)
    out.update(trigger_words=trigger_words_from_metadata(meta), params_m=round(_n_params(shapes) / 1e6, 1))
    return out


def _unet_lora_family(shapes, base=""):
    """sd1 / sd2 / sdxl for a UNet LoRA, or None when its layers do not tell."""
    L = _Layers(shapes)
    family = _unet_family(L, L.te)[0]
    if family is None:
        family = family_of_base(base)[0] if family_of_base(base)[0] in ("sd1", "sd2", "sdxl") else None
    return family


# the sub-bases a model's LoRAs must match. In model.json they are kept as "sub_base": "variant" there is the
# weights' file variant diffusers loads (fp16, bf16), and a sub-base written there makes it look for files like
# model.klein4b.safetensors (the recheck of 2026-10-07 did that; recheck.py moves it back)
SUB_BASES = ("klein4b", "klein9b", "dev", "5b", "14b")


def file_variant(m):
    """The weights' file variant of a model (model.json "variant", e.g. fp16) for diffusers, never a sub-base."""
    v = m.get("variant")
    return v if v and v not in SUB_BASES else None


def model_variant(m):
    """The sub-base of an installed model (model.json) its LoRAs must match, or None."""
    if m.get("sub_base"):
        return m["sub_base"]
    if m.get("variant") in SUB_BASES:
        return m["variant"]
    arch = m.get("arch")
    if arch == "flux2_dev":
        return "dev"
    if arch == "flux2_klein":
        p = (m.get("components") or {}).get("transformer")
        if p:
            return "klein9b" if p > 6 else "klein4b"
        names = " ".join(str(x) for x in (m.get("name"), (m.get("source") or {}).get("ref"),
                                          (m.get("source") or {}).get("file"))).lower()
        return "klein9b" if re.search(r"(^|[^0-9])9b", names) else "klein4b" if re.search(r"(^|[^0-9])4b", names) else None
    if arch == "wan22_ti2v":
        return "5b"
    if arch == "wan22_i2v_14b":
        return "14b"
    return None


def lora_mismatch(lm, m):
    """Why a LoRA (its lora.json) does not fit a model (its model.json), or None when it fits."""
    spec = ARCHS.get(m.get("arch")) or {}
    family = spec.get("family") or m.get("family")
    label = m.get("label") or spec.get("label") or family
    name = lm.get("name") or "?"
    if m.get("unsupported"):
        return m["unsupported"]
    if spec.get("user_loras") is False or m.get("user_loras") is False:
        return "%s takes no LoRAs yet" % label
    if lm.get("family") != family:
        return "The LoRA %s is made for %s models, the selected model is %s" % (
            name, family_label(lm.get("family"), lm.get("variant")), label)
    lv, mv = lm.get("variant"), model_variant(m)
    if lv and mv and lv != mv:
        return "The LoRA %s is made for %s, the selected model is %s (%s): its layers have other sizes" % (
            name, VARIANT_LABELS.get(lv, lv), label, VARIANT_LABELS.get(mv, mv))
    return None


def read_gguf_header(path):
    from gguf import GGUFReader
    reader = GGUFReader(path)
    return {t.name: [int(x) for x in t.shape] for t in reader.tensors}


class IncompleteHeader(ValueError):
    """The bytes end before the GGUF tensor list does."""


# GGUF metadata value types: struct formats of the fixed-size ones (8 = string, 9 = array)
_GGUF_SCALARS = {0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 6: "f", 7: "?", 10: "Q", 11: "q", 12: "d"}


def parse_gguf_header(data):
    """{tensor_name: shape} from the first bytes of a GGUF file (a range request: the header lies before
    the weights). Shapes in GGUF order, as read_gguf_header returns them."""
    if data[:4] != b"GGUF":
        raise UnsupportedModel("Not a GGUF file")
    pos = 4

    def take(fmt):
        nonlocal pos
        size = struct.calcsize("<" + fmt)
        if pos + size > len(data):
            raise IncompleteHeader()
        value = struct.unpack_from("<" + fmt, data, pos)[0]
        pos += size
        return value

    def text():
        nonlocal pos
        n = take("Q")
        if pos + n > len(data):
            raise IncompleteHeader()
        pos += n
        return data[pos - n:pos].decode("utf-8", "replace")

    def skip_value(kind):
        if kind == 8:
            text()
        elif kind == 9:
            item, n = take("I"), take("Q")
            for _ in range(n):
                skip_value(item)
        elif kind in _GGUF_SCALARS:
            take(_GGUF_SCALARS[kind])
        else:
            raise UnsupportedModel("Not a valid GGUF file")

    take("I")  # version
    n_tensors, n_kv = take("Q"), take("Q")
    for _ in range(n_kv):
        text()
        skip_value(take("I"))
    shapes = {}
    for _ in range(n_tensors):
        name = text()
        shapes[name] = [take("Q") for _ in range(take("I"))]
        take("I")  # type
        take("Q")  # offset
    return shapes


def read_single_file_header(path):
    if path.lower().endswith(".gguf"):
        return read_gguf_header(path)
    if path.lower().endswith(".safetensors"):
        return read_safetensors_header(path)
    raise UnsupportedModel("Only .safetensors and .gguf files are supported (no .ckpt/pickle for this engine)")


def _strip(keys):
    prefixes = ("model.diffusion_model.", "diffusion_model.", "net.")  # "net.": Cosmos / Anima checkpoints
    out = set()
    for k in keys:
        for p in prefixes:
            if k.startswith(p):
                k = k[len(p):]
                break
        out.add(k)
    return out


def _n_params(shapes):
    total = 0
    for s in shapes.values():
        n = 1
        for d in s:
            n *= d
        total += n
    return total


def sd1_or_2(shapes, keys, ref="", overrides=None):
    """SD 1.x / 2.x single-file checkpoint (original key names): which kind it is."""
    overrides = name_overrides(ref) if overrides is None else overrides
    first_conv = next((v for k, v in shapes.items() if k.endswith("input_blocks.0.0.weight")), None)
    if first_conv is not None and len(first_conv) == 4 and first_conv[1] == 9:
        return "sd15_inpaint", "single_full", overrides, None
    if any(k.startswith("cond_stage_model.model.") for k in keys):  # OpenCLIP text encoder: SD 2.x
        # 768 px (v-prediction) or 512 px "base" (epsilon): the files do not say; the name usually does
        r = (ref or "").lower()
        return ("sd21_base" if ("512" in r or "base" in r) else "sd21"), "single_full", overrides, None
    return "sd15", "single_full", overrides, None


def is_chroma(shapes):
    """A Chroma checkpoint (FLUX.1's blocks, a distilled guidance network instead of the modulation layers), in
    the original names (double_blocks) or diffusers' (transformer_blocks); Chroma Radiance (nerf_blocks) is none."""
    keys = _strip(shapes.keys())
    return any(k.startswith("distilled_guidance_layer.") for k in keys) \
        and any(k.startswith(("double_blocks.", "transformer_blocks.")) for k in keys) \
        and not any(k.startswith("nerf_") for k in keys)


def detect_from_single_file(shapes, ref=""):
    """Returns (arch, layout, overrides, denoiser_params_billion).

    layout: "single_full"   the file holds the whole pipeline (SDXL checkpoints)
            "single_denoiser" the file holds only the transformer, the rest comes from the base repo
    """
    keys = _strip(shapes.keys())
    overrides = name_overrides(ref)

    def has(prefix):
        return any(k.startswith(prefix) for k in keys)

    # LoRA adapters use the same block names as the model they were trained for, so they
    # must be ruled out before looking at the architecture
    if is_lora(keys):
        raise LoraFile("This file is a LoRA adapter, not a complete model")

    denoiser_shapes = {k: v for k, v in shapes.items()
                       if not k.startswith(("text_encoders.", "first_stage_model.", "vae.", "cond_stage_model."))}
    params = _n_params(denoiser_shapes) / 1e9

    # before the SD checks: "all in one" Anima checkpoints carry their text encoder as cond_stage_model.*
    if has("llm_adapter.blocks."):  # Anima (Cosmos-Predict2 + LLM adapter), ComfyUI format
        # the distilled Turbo version: CFG 1 and 8-12 steps (model card)
        turbo = {"num_steps": 10, "guidance_scale": 1.0} if "turbo" in (ref or "").lower() else {}
        return "anima", "comfy_files", turbo, params
    if has("conditioner.embedders.1."):
        return "sdxl", "single_full", overrides, None
    if has("cond_stage_model.") or (has("input_blocks.") and not has("label_emb.")):
        return sd1_or_2(shapes, keys, ref, overrides)

    if has("distilled_guidance_layer.") and has("nerf_blocks."):
        raise UnsupportedModel(CHROMA_OTHERS % "Chroma Radiance")
    if is_chroma(shapes):
        if not has("img_in.") and not has("x_embedder."):
            raise UnsupportedModel("Incomplete Chroma checkpoint (no input layer): the file holds only some blocks")
        # safetensors in BF16 or FP8 (converted to 8 bit GGUF on import) and GGUF files, original or diffusers names
        return "chroma", "single_denoiser", chroma_overrides(ref, overrides), params
    if "single_stream_modulation.lin.weight" in keys:
        return ("flux2_dev" if params > 20 else "flux2_klein"), "single_denoiser", overrides, params
    if has("double_blocks.") and has("single_blocks.") and not has("img_in."):
        raise UnsupportedModel("Incomplete FLUX checkpoint (no input layer): the file holds only some blocks")
    if has("double_blocks.") and has("single_blocks."):
        arch = "flux1_dev" if has("guidance_in.") else "flux1_schnell"
        return arch, "single_denoiser", overrides, params
    if has("transformer_blocks.") and has("single_transformer_blocks."):  # diffusers-format flux
        arch = "flux1_dev" if has("time_text_embed.guidance_embedder.") else "flux1_schnell"
        return arch, "single_denoiser", overrides, params
    if has("head.modulation") and has("patch_embedding."):  # Wan 2.x video models
        # GGUF lists dimensions in reverse order: take them by size, not by position
        head = next((v for k, v in shapes.items() if k.endswith("head.head.weight")), [0])
        patch = next((v for k, v in shapes.items() if k.endswith("patch_embedding.weight")), [0])
        out_channels = min(head) // 4
        in_channels = sorted(set(patch))[-2] if len(set(patch)) > 1 else 0
        name = (ref or "").lower()
        if out_channels == 48:  # Wan 2.2 TI2V 5B: 48 latent channels
            return "wan22_ti2v", "comfy_files", {}, params
        if out_channels == 16 and in_channels == 36 and re.search(r"2\.2|2_2|a14b", name):  # Wan 2.2 I2V 14B
            if "low" in name and "high" not in name:
                raise UnsupportedModel("This is the low-noise half of Wan 2.2 I2V 14B: import the high-noise "
                                       "file, the low-noise one is added automatically")
            return "wan22_i2v_14b", "comfy_files", {}, params
        raise UnsupportedModel("Of the Wan video models Wan 2.2 TI2V 5B and Wan 2.2 I2V 14B are supported")
    # Qwen-Image 2.1: its text input has its own norm (txt_in.text_norm)
    if "txt_in.text_norm.weight" in keys:
        return "qwen_image21", "single_denoiser", _qwen_overrides(ref, overrides), params
    # Qwen-Image (MMDiT with separate image / text modulation): txt_norm before txt_in, img_mod per block.
    # The file of Qwen-Image-Edit looks the same: its name tells (_qwen_overrides)
    if "txt_norm.weight" in keys and has("img_in.") and has("transformer_blocks.0.img_mod."):
        return "qwen_image", "single_denoiser", _qwen_overrides(ref, overrides), params
    if has("llm_cond_proj.") and has("layers.0.attention.qkv."):  # Ideogram 4 (one of its two transformers)
        return "ideogram4", "single_denoiser", {}, params
    width = _next_dit_width(shapes)
    if width == 3840:
        # Z-Image: ComfyUI's original names (fused attention.qkv) or diffusers' (to_q / to_k / to_v); safetensors in
        # BF16 / FP16 / FP8 (converted to 8 bit GGUF on import) and GGUF files. Turbo and Base look the same: the name
        # (or Civitai's base model) tells
        if has("siglip_embedder.") or has("siglip_refiner."):
            raise UnsupportedModel(Z_IMAGE_OTHERS % "Z-Image Omni / Edit")
        if not has("x_embedder.") and not has("all_x_embedder."):
            raise UnsupportedModel("Incomplete Z-Image checkpoint (no input layer): the file holds only some layers")
        return "z_image", "single_denoiser", z_image_overrides(ref), params
    if width:
        raise UnsupportedModel("Lumina 2 and other NextDiT models are not supported (only Z-Image)")
    if has("txtfusion.") and has("blocks.0.mod.lin"):  # Krea 2 in Krea's own format
        return "krea2", "single_denoiser", {}, params  # its own defaults, not the "turbo" rule
    if has("text_fusion.") and has("transformer_blocks."):
        raise UnsupportedModel("Krea 2 checkpoints in diffusers format are not supported as a single file; "
                               "use the original checkpoint or the krea/Krea-2-Turbo repo")
    if has("joint_blocks."):
        depth = len({k.split(".")[1] for k in keys if k.startswith("joint_blocks.")})
        return ("sd35_large" if depth >= 30 else "sd35_medium"), "single_denoiser", overrides, params
    sample = ", ".join(sorted(keys)[:4])
    raise UnsupportedModel("Could not recognise the model architecture of this file (keys such as %s)" % sample)
