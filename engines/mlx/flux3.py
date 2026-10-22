# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""FLUX 3 Image Klein on the MLX runtime, with flux3-mlx (Apache-2.0), which reads Black Forest Labs' own files
(model.safetensors, ae.safetensors, text_encoder/) and the MLX-quantized repos made for it (transformer/, vae/,
config.json "format": "flux3-mlx").

flux3-mlx has no LoRAs: they are put next to the transformer's linear layers here (y = W x + s B A x), which also
works on its quantized layers. LoRA files come in Black Forest Labs' names (ComfyUI, ai-toolkit), in diffusers' names
and in kohya's flattened names; all three are brought to the transformer's own (BFL) names.

The prompt upsampler (black-forest-labs/flux-3-image-klein-pup, Apache-2.0) is optional: it writes the full scene
caption the model is trained on from a short prompt. It runs with mlx-lm, which reads its language part; pictures
for an edit would need its vision part, so a job with a picture is not upsampled."""
import gc
import json
import os
import re

import memory
import protocol

# flux3-mlx's own sampling defaults (keyed by the transformer's flow map: distilled checkpoints have one)
DISTILLED_STEPS = 16
BASE_STEPS, BASE_GUIDANCE = 50, 3.5
# a LoRA of which fewer of its layers find their place does not fit the model (as in the other engines)
MIN_APPLIED = 0.9
# the upsampler's decoding as Black Forest Labs' reference runs it (greedy, presence penalty 1.5 for text to image)
UPSAMPLE_MAX_TOKENS = 3584
UPSAMPLE_PRESENCE_PENALTY = 1.5


def is_flux3_folder(folder):
    """Black Forest Labs' repo (model.safetensors with its manifest) or an MLX repo for flux3-mlx."""
    config = os.path.join(folder, "config.json")
    if os.path.isfile(config):
        try:
            with open(config) as f:
                c = json.load(f)
        except (OSError, ValueError):
            c = {}
        if c.get("format") == "flux3-mlx" or str(c.get("model", "")).startswith("flux-3-image-klein"):
            return True
    return os.path.isfile(os.path.join(folder, "modular_model_index.json"))


def _file_gb(folder, *names):
    total = 0
    for name in names:
        path = os.path.join(folder, name)
        if os.path.isdir(path):
            total += sum(os.path.getsize(os.path.join(path, f)) for f in os.listdir(path) if f.endswith(".safetensors")
                         and not f.startswith("._"))
        elif os.path.isfile(path):
            total += os.path.getsize(path)
    return total / 1e9


def components(folder):
    """{component: billions of 16 bit parameters as large as its files}: flux3-mlx holds the weights as they lie on
    disk (quantized or not), so the shared memory plan comes out at their size (the importer counts them alike)."""
    return {"transformer": (_file_gb(folder, "transformer") or _file_gb(folder, "model.safetensors")) / 2,
            "text_encoder": _file_gb(folder, "text_encoder") / 2,
            "vae": (_file_gb(folder, "vae", "ae.safetensors") or 0.3) / 2}


def plan(folder, ram_gb=None):
    """(low_memory, peak_gb) by the shared memory plan: both parts resident, or the prompt encoded before the
    transformer is loaded (low_memory: they are never in memory together). Raises MemoryError when neither fits."""
    p = memory.plan(components(folder), "transformer", "flux3", ram_gb if ram_gb is not None else memory.total_ram_gb(),
                    quant="none", allow_staging=True, staging_frees_denoiser=True)
    if not p["fits"]:
        raise MemoryError("FLUX 3 Image Klein needs about %d GB RAM in this form; a more quantized download fits: "
                          "the 6 bit MLX repo runs on 16 GB Macs" % p["min_ram_gb"])
    return p["staged_text_encoder"], p["est_peak_gb"]


# ------------------------------------------------------------------ LoRAs

_DOWN = re.compile(r"\.(lora_A|lora_down|lora\.down)(\.default)?\.weight$")
_UP = re.compile(r"\.(lora_B|lora_up|lora\.up)(\.default)?\.weight$")
_PREFIXES = ("base_model.model.", "diffusion_model.", "transformer.", "model.diffusion_model.")
# diffusers' module names -> Black Forest Labs' (flux3-mlx's), as diffusers' FLUX 3 transformer and mflux name them
_PARTS = [("attn.to_q", "q_proj"), ("attn.to_k", "k_proj"), ("attn.to_v", "v_proj"), ("attn.to_out.0", "attn_out"),
          ("attn.to_out", "attn_out"), ("ff.linear_in", "mlp_in"), ("ff.linear_out", "mlp_out")]
_GLOBALS = {"context_embedder": "txt_in", "timestep_embedder.linear_1": "time_in.in_layer",
            "timestep_embedder.linear_2": "time_in.out_layer", "target_timestep_embedder.linear_1": "ref_time_in.in_layer",
            "target_timestep_embedder.linear_2": "ref_time_in.out_layer", "proj_out": "final_layer.image.linear",
            "norm_out.linear": "final_layer.image.adaLN_modulation.1"}
# diffusers keeps the final modulation as (scale, shift), Black Forest Labs as (shift, scale)
_SWAPPED = {"norm_out.linear"}


def bfl_name(module):
    """A LoRA's module name (diffusers or BFL, prefixes removed) in BFL's names; (name, swap_halves)."""
    if module in _GLOBALS:
        return _GLOBALS[module], module in _SWAPPED
    m = re.match(r"^x_embedders\.(image|image_cond)$", module)
    if m:
        return "emb_in." + m.group(1), False
    m = re.match(r"^(early_stream_modulations|single_stream_modulations)\.(image|image_cond|txt)\.linear$", module)
    if m:
        return "%s.%s.lin" % (m.group(1), m.group(2)), False
    m = re.match(r"^(mode_blocks\.(?:image|image_cond)|txt_mode_blocks|single_transformer_blocks)\.(\d+)\.(.+)$", module)
    if m:
        stack = {"single_transformer_blocks": "single_blocks"}.get(m.group(1), m.group(1).replace("mode_blocks.", "content_mode_blocks."))
        part = m.group(3)
        for diffusers_part, bfl_part in _PARTS:
            if part == diffusers_part:
                part = bfl_part
                break
        return "%s.%s.%s" % (stack, m.group(2), part), False
    return module, False


def lora_layers(weights, targets):
    """{target path: (down, up, alpha, swap)} of a LoRA's tensors; targets: the transformer's linear layer paths.
    Returns (layers, number of the LoRA's layers)."""
    flat = {t.replace(".", "_"): t for t in targets}
    found, total = {}, 0
    for key in weights:
        m = _DOWN.search(key)
        if not m:
            continue
        total += 1
        base = key[:m.start()]
        up = next((base + s for s in (".lora_B.weight", ".lora_up.weight", ".lora.up.weight", ".lora_B.default.weight",
                                       ".lora_up.default.weight") if base + s in weights), None)
        if up is None:
            continue
        module = base
        for p in _PREFIXES:
            if module.startswith(p):
                module = module[len(p):]
                break
        swap = False
        if module.startswith("lora_unet_"):
            target = flat.get(module[len("lora_unet_"):])
        else:
            name, swap = bfl_name(module)
            target = name if name in targets else None
        if target is None:
            continue
        alpha = weights.get(base + ".alpha")
        found[target] = (weights[key], weights[up], alpha, swap)
    return found, total


def apply_loras(dit, loras):
    """Puts each LoRA next to the transformer's linear layers; refuses one that does not fit (another model, the
    distilled model's ref_time_in on Base). loras: [{"file", "scale", "name"}]."""
    import mlx.core as mx
    import mlx.nn as nn

    linear = (nn.Linear, nn.QuantizedLinear)
    modules = dict(dit.named_modules())
    targets = {path for path, mod in modules.items() if isinstance(mod, linear)}
    extra = {}
    for lora in loras:
        weights = mx.load(lora["file"])
        layers, total = lora_layers(weights, targets)
        if not total or len(layers) < total * MIN_APPLIED:
            raise ValueError("The LoRA %s does not fit this FLUX 3 Image Klein model: only %d%% of its layers (%d of "
                             "%d) found their place" % (lora["name"], int(100 * len(layers) / max(1, total)),
                                                       len(layers), total))
        if any(k.endswith(".dora_scale") for k in weights):
            protocol.log("[mlx] LoRA %s is a DoRA: its magnitude part is left out, the low-rank part applies"
                         % lora["name"])
        for path, (down, up, alpha, swap) in layers.items():
            if swap:
                half = up.shape[0] // 2
                up = mx.concatenate([up[half:], up[:half]], axis=0)
            rank = down.shape[0]
            scale = float(lora["scale"]) * (float(alpha.item()) / rank if alpha is not None else 1.0)
            extra.setdefault(path, []).append((down.astype(mx.bfloat16), up.astype(mx.bfloat16), scale))
        protocol.log("[mlx] LoRA %s: %d of %d layers applied" % (lora["name"], len(layers), total))
    for path, adapters in extra.items():
        _replace(dit, path, LoRALinear(modules[path], adapters))
    return len(extra)


def _lora_class():
    import mlx.nn as nn

    class _LoRALinear(nn.Module):
        """A linear layer (plain or quantized) with low-rank updates beside it."""

        def __init__(self, base, adapters):
            super().__init__()
            self.base = base
            self.adapters = adapters  # [(down, up, scale)], frozen: plain attributes, not parameters
            self.freeze()

        def __call__(self, x):
            y = self.base(x)
            for down, up, scale in self.adapters:
                y = y + scale * ((x @ down.T) @ up.T).astype(y.dtype)
            return y

    return _LoRALinear


def LoRALinear(base, adapters):
    return _lora_class()(base, adapters)


def _replace(root, path, new):
    """Sets the module at a dotted path (through modules, dicts and lists, as MLX names them)."""
    parts = path.split(".")
    parent = root
    for p in parts[:-1]:
        parent = parent[int(p)] if isinstance(parent, list) else parent[p]
    last = parts[-1]
    if isinstance(parent, list):
        parent[int(last)] = new
    else:
        parent[last] = new


# ------------------------------------------------------------------ the prompt upsampler

class Upsampler:
    """The FLUX 3 prompt upsampler (MLX-quantized), loaded for one prompt and freed again (it is the largest part)."""

    def __init__(self, folder):
        self.folder = folder

    def __call__(self, prompt, stop=None):
        """stop: called after each token; it raises to end the writing (Stop on the job)."""
        import mlx.core as mx
        from flux3_mlx import bbox
        from mlx_lm import load, stream_generate
        from mlx_lm.sample_utils import make_logits_processors, make_sampler

        system_key, prompt, locked = bbox.plan(prompt, None, 0)
        with open(os.path.join(self.folder, "system_prompts.json")) as f:
            system = json.load(f)[system_key]
        model, tokenizer = load(self.folder)
        try:
            messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
            text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True,
                                                 enable_thinking=False)
            parts = []
            for response in stream_generate(model, tokenizer, text, max_tokens=UPSAMPLE_MAX_TOKENS,
                                            sampler=make_sampler(temp=0.0),
                                            logits_processors=make_logits_processors(
                                                presence_penalty=UPSAMPLE_PRESENCE_PENALTY,
                                                presence_context_size=UPSAMPLE_MAX_TOKENS)):
                parts.append(response.text)
                if stop is not None:
                    stop()
            caption = "".join(parts)
        finally:
            del model
            gc.collect()
            mx.clear_cache()
        caption = caption.strip()
        if not caption:
            raise RuntimeError("The prompt upsampler wrote nothing")
        # layout boxes of the prompt stay exactly as given (as Black Forest Labs' reference keeps them)
        return bbox.reconcile(caption, locked) if locked else caption


def upsampler_gb(folder):
    """What the upsampler holds in memory: its weights as on disk."""
    return _file_gb(folder, ".")


def finished_caption(prompt):
    """A prompt that already is a full caption (or carries layout boxes) goes to the model as it is."""
    from flux3_mlx import bbox
    return bbox.is_finished(prompt)


# ------------------------------------------------------------------ the model

def text_encoder_root(folder):
    """Where flux3-mlx finds the text encoder: the model folder, or, when macOS wrote "._name" companions next to the
    files (exFAT / FAT drives), a folder of links to the real files only. flux3-mlx reads every *.safetensors of
    text_encoder/, a "._model.safetensors" too, and fails on it. The links go into the app's own data folder and are
    made anew each time, so nothing stale or foreign can be among them."""
    import hashlib
    import shutil
    import tempfile
    te = os.path.join(folder, "text_encoder")
    names = sorted(os.listdir(te)) if os.path.isdir(te) else []
    if not any(n.startswith("._") for n in names):
        return folder
    tag = hashlib.sha1(os.path.realpath(te).encode()).hexdigest()[:16]
    base = os.environ.get("VK_DATA_DIR") or tempfile.gettempdir()
    shadow = os.path.join(base, "flux3_text_encoders", tag)
    shutil.rmtree(shadow, ignore_errors=True)
    os.makedirs(os.path.join(shadow, "text_encoder"), mode=0o700)
    for n in names:
        if not n.startswith("._"):
            os.symlink(os.path.join(te, n), os.path.join(shadow, "text_encoder", n))
    return shadow


class Flux3Model:
    """One FLUX 3 Image Klein folder loaded with flux3-mlx, with the job's LoRAs."""

    def __init__(self, folder, loras, low_memory, peak=0.0):
        from flux3_mlx.api import Flux3Klein, check_format
        from flux3_mlx.pipeline import Pipeline
        from pathlib import Path

        try:
            check_format(Path(folder))
        except SystemExit as e:  # flux3-mlx ends the process for a folder of a newer format; one job fails instead
            raise ValueError(str(e))
        self.folder = folder
        self.low_memory = low_memory
        self.peak = peak  # the plan's peak in GB, to tell whether the upsampler fits beside it
        self.pipeline = Pipeline(folder, text_encoder=text_encoder_root(folder), low_memory=low_memory)
        self.klein = Flux3Klein(self.pipeline, None, low_memory)
        # (prompts, encodings) made before the transformer was loaded (encode_first)
        self.encoded = None
        self._encode = self.pipeline.encode_prompts
        self.pipeline.encode_prompts = self._encoded_or_new
        self.loras = loras
        if loras:
            applied = apply_loras(self.pipeline.dit, loras)
            protocol.log("[mlx] %d LoRA layers beside the transformer" % applied)

    def _encoded_or_new(self, prompts):
        if self.encoded is not None and self.encoded[0] == prompts:
            return self.encoded[1]
        return self._encode(prompts)

    def make_room(self, need_gb, ram_gb=None):
        """Room for the upsampler (need_gb) when it does not fit beside the loaded parts: the transformer and the text
        encoder are freed and read again for the picture (the LoRAs with the transformer)."""
        budget = memory.budget_gb(ram_gb if ram_gb is not None else memory.total_ram_gb())
        if self.peak + need_gb <= budget:
            return False
        import mlx.core as mx
        self.pipeline._dit = None
        self.pipeline._te = None
        gc.collect()
        mx.clear_cache()
        return True

    def encode_first(self, caption, distilled):
        """On low memory: the prompt is encoded while the transformer is not loaded (flux3-mlx loads the transformer
        first and then the text encoder for the prompt, which needs both in memory at once); flux3-mlx then gets the
        encoding from here instead of loading the text encoder again."""
        import mlx.core as mx
        prompts = [caption] if distilled else ["", caption]
        if self.encoded is not None and self.encoded[0] == prompts:
            return
        if self.pipeline._dit is not None:
            self.pipeline._dit = None
            gc.collect()
            mx.clear_cache()
        self.encoded = (prompts, self._encode(prompts))

    def generate(self, caption, images, width, height, steps, guidance, seed, callback, distilled=True):
        if self.low_memory:
            self.encode_first(caption, distilled)
        if self.pipeline._dit is None and self.loras:
            apply_loras(self.pipeline.dit, self.loras)
        image, _record = self.klein(caption, images=images or None, width=width, height=height, steps=steps,
                                    guidance=guidance, seed=seed, upsample=False, callback=callback)
        return image
