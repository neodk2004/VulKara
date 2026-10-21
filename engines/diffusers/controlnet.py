# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""ControlNet for the diffusers engine.

SDXL and FLUX.1 use one "union" model that covers pose, depth and edges; SD 1.5 and SD 3.5 have
one model per control type. The models are downloaded on first use into <models folder>/../controlnets/<id>/.
"""
import os
from pathlib import Path

import paths

# control types offered in the app
TYPES = ["BodyPose", "Depth", "Canny", "LineArt", "Scribble", "Tile"]

_SD3 = {
    "class": "SD3ControlNetModel",
    "pipeline": "StableDiffusion3ControlNetPipeline",
    "img2img_pipeline": None,  # diffusers has no SD 3 ControlNet img2img pipeline
    "files": ["config.json", "diffusion_pytorch_model.safetensors"],
    "tuning": {},
}


def _sd3(model_id, repo, size_gb, params_b, control_type):
    return dict(_SD3, id=model_id, repo=repo, size_gb=size_gb, params_b=params_b, modes={control_type: None})


def _sd15(control_type, repo):
    """lllyasviel's ControlNet 1.1 for SD 1.5 (the 16 bit files, 0.72 GB, under the plain name)."""
    return {"id": repo.split("/")[1].replace("_", "-"), "repo": repo,
            "files": ["config.json", "diffusion_pytorch_model.safetensors"],
            "remote_files": {"config.json": "config.json",
                             "diffusion_pytorch_model.fp16.safetensors": "diffusion_pytorch_model.safetensors"},
            "size_gb": 0.72, "params_b": 0.36, "class": "ControlNetModel",
            "pipeline": "StableDiffusionControlNetPipeline", "img2img_pipeline": "StableDiffusionControlNetImg2ImgPipeline",
            "modes": {control_type: None}, "tuning": {}, "control_arg": "image"}


# per family (union models) or per arch (one model per control type, "per_type")
MODELS = {
    "sdxl": {
        "id": "controlnet-union-sdxl-1.0-promax",
        "repo": "xinsir/controlnet-union-sdxl-1.0",
        # the ProMax variant (8 control types incl. tile) under the names diffusers expects
        "files": ["config.json", "diffusion_pytorch_model.safetensors"],
        "remote_files": {"config_promax.json": "config.json",
                         "diffusion_pytorch_model_promax.safetensors": "diffusion_pytorch_model.safetensors"},
        "size_gb": 2.5, "params_b": 1.25,
        "class": "ControlNetUnionModel",
        "pipeline": "StableDiffusionXLControlNetUnionPipeline",
        "img2img_pipeline": "StableDiffusionXLControlNetUnionImg2ImgPipeline",
        # control_mode of the union model: 0 openpose, 1 depth, 2 soft edge/scribble, 3 canny/lineart, 6 tile
        "modes": {"BodyPose": 0, "Depth": 1, "Scribble": 2, "Canny": 3, "LineArt": 3, "Tile": 6},
        # (scale, end) the weight slider is multiplied with
        "tuning": {},
    },
    "flux1": {
        "id": "flux1-dev-controlnet-union-pro-2.0",
        "repo": "Shakker-Labs/FLUX.1-dev-ControlNet-Union-Pro-2.0",
        "files": ["config.json", "diffusion_pytorch_model.safetensors"],
        "size_gb": 4.3, "params_b": 2.15,
        "class": "FluxControlNetModel",
        "pipeline": "FluxControlNetPipeline",
        "img2img_pipeline": "FluxControlNetImg2ImgPipeline",
        # Pro 2.0 has no mode input, it reads the kind of control from the image
        "modes": {"BodyPose": None, "Depth": None, "Scribble": None, "Canny": None, "LineArt": None},
        # recommended by the authors
        "tuning": {"BodyPose": (0.9, 0.65), "Depth": (0.8, 0.8), "Canny": (0.7, 0.8),
                   "LineArt": (0.7, 0.8), "Scribble": (0.7, 0.8)},
    },
    # SD 1.5 (also its fine-tunes): ControlNet 1.1 (tile only exists as a pickle file, so it is left out)
    "sd15": {"per_type": {
        "BodyPose": _sd15("BodyPose", "lllyasviel/control_v11p_sd15_openpose"),
        "Depth": _sd15("Depth", "lllyasviel/control_v11f1p_sd15_depth"),
        "Canny": _sd15("Canny", "lllyasviel/control_v11p_sd15_canny"),
        "LineArt": _sd15("LineArt", "lllyasviel/control_v11p_sd15_lineart"),
        "Scribble": _sd15("Scribble", "lllyasviel/control_v11p_sd15_scribble"),
    }},
    # SD 3.5 Medium: TensorArt (stored in float32, 1.2B parameters)
    "sd35_medium": {"per_type": {
        "Depth": _sd3("sd35m-controlnet-depth", "tensorart/SD3.5M-Controlnet-Depth", 4.9, 1.23, "Depth"),
        "Canny": _sd3("sd35m-controlnet-canny", "tensorart/SD3.5M-Controlnet-Canny", 4.9, 1.23, "Canny"),
    }},
    # SD 3.5 Large: Stability AI ("blur" is their tile model)
    "sd35_large": {"per_type": {
        "Depth": _sd3("sd35l-controlnet-depth", "stabilityai/stable-diffusion-3.5-large-controlnet-depth", 8.6, 2.15, "Depth"),
        "Canny": _sd3("sd35l-controlnet-canny", "stabilityai/stable-diffusion-3.5-large-controlnet-canny", 8.6, 2.15, "Canny"),
        "Tile": _sd3("sd35l-controlnet-blur", "stabilityai/stable-diffusion-3.5-large-controlnet-blur", 8.6, 2.15, "Tile"),
    }},
}


# control types with their own model next to a family's union model
EXTRA = {
    "sd1": {
        "Illusion": {
            "id": "sd15-qrcode-monster-v2", "repo": "monster-labs/control_v1p_sd15_qrcode_monster",
            "files": ["config.json", "diffusion_pytorch_model.safetensors"],
            "remote_files": {"v2/config.json": "config.json",
                             "v2/diffusion_pytorch_model.safetensors": "diffusion_pytorch_model.safetensors"},
            "size_gb": 1.45, "params_b": 0.36,
            "class": "ControlNetModel", "pipeline": "StableDiffusionControlNetPipeline",
            "img2img_pipeline": "StableDiffusionControlNetImg2ImgPipeline",
            "modes": {"Illusion": None}, "tuning": {}, "control_arg": "image",
        },
    },
    "sdxl": {
        # optical illusions / hidden patterns: the pattern image steers light and dark areas
        "Illusion": {
            "id": "sdxl-qrcode-monster", "repo": "monster-labs/control_v1p_sdxl_qrcode_monster",
            "files": ["config.json", "diffusion_pytorch_model.safetensors"], "size_gb": 5.0, "params_b": 1.25,
            "class": "ControlNetModel", "pipeline": "StableDiffusionXLControlNetPipeline",
            "img2img_pipeline": "StableDiffusionXLControlNetImg2ImgPipeline",
            "modes": {"Illusion": None}, "tuning": {}, "control_arg": "image",
        },
    },
}


def _entry(arch, family):
    return MODELS.get(arch) or MODELS.get(family)


def types_for(arch, family):
    e = _entry(arch, family)
    if not e:
        return []
    available = e["per_type"] if "per_type" in e else e["modes"]
    return [t for t in TYPES if t in available] + list(EXTRA.get(family, {}))


def resolve(arch, family, control_type):
    """The ControlNet model spec for a model and control type; ValueError if there is none."""
    extra = EXTRA.get(family, {}).get(control_type)
    if extra:
        return extra
    e = _entry(arch, family)
    if not e:
        raise ValueError("ControlNet is not available for this model type yet")
    spec = e["per_type"].get(control_type) if "per_type" in e else (e if control_type in e["modes"] else None)
    if spec is None:
        raise ValueError("ControlNet %s is not available for this model. Available: %s"
                         % (control_type, ", ".join(types_for(arch, family))))
    return spec


def root(models_dir=None):
    r = Path(models_dir).parent / "controlnets" if models_dir else paths.helpers_dir("controlnets")
    r.mkdir(parents=True, exist_ok=True)
    return r


def local_dir(spec):
    return root() / spec["id"]


def is_downloaded(spec):
    d = local_dir(spec)
    return all((d / f).is_file() for f in spec["files"])


def ensure_downloaded(spec, report=None, token=None):
    """Downloads the ControlNet once at its pinned commit and checks it (pinned.py; a copy from before the pins is
    checked once); report(stage, pct) shows progress."""
    import pinned
    from importer import _ProgressWatcher
    d = local_dir(spec)
    remote = spec.get("remote_files") or {f: f for f in spec["files"]}
    if pinned.ready(spec["repo"], str(d), rename=remote):
        return d
    d.mkdir(parents=True, exist_ok=True)
    stage = "Downloading ControlNet (%.1f GB, one-time)" % spec["size_gb"]
    with _ProgressWatcher(str(d), int(spec["size_gb"] * 1024 ** 3), stage, report=report):
        pinned.fetch_pinned(spec["repo"], str(d), rename=remote, token=token or os.environ.get("HF_TOKEN"),
                            report=(lambda m: report(m, -1)) if report else None)
    if not is_downloaded(spec):
        raise RuntimeError("ControlNet download incomplete: %s" % spec["repo"])
    return d


def call_kwargs(spec, control_type, weight, image, family, img2img=False):
    """Arguments for the ControlNet pipeline's __call__."""
    scale, end = spec["tuning"].get(control_type, (1.0, 1.0))
    kw = {"controlnet_conditioning_scale": float(weight) * scale, "control_guidance_end": end}
    mode = spec["modes"][control_type]
    if spec.get("control_arg") == "image":
        # classic ControlNet pipelines: "image" is the control image (their img2img variant
        # takes the init image as "image" and the control image as "control_image")
        kw["control_image" if img2img else "image"] = image
    elif family == "sdxl":
        kw.update(control_image=[image], control_mode=[mode])
    else:
        kw["control_image"] = image
        if mode is not None:
            kw["control_mode"] = mode
    return kw
