# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""LoRA training with mflux (FLUX.2 [klein], Krea 2) on the user's pictures.

    python main.py train <job.json>

job: {"name", "trigger", "base_model": imported model folder, "images": [{"path", "caption"}],
      "resolution", "steps", "rank", "learning_rate", "work_dir", "loras_dir"}
Progress is printed as "__train__ {json}" lines (phase, step, total, loss, eta); at the end the LoRA
is stored in <loras_dir>/<name>/ like an imported one ("__train__ {"done": …}").
"""
import json
import math
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(1, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "diffusers"))

import memory  # noqa: E402
import registry  # noqa: E402
from trainutil import emit, prepare_images, write_lora_folder  # noqa: E402

# mflux model names and LoRA targets per architecture (module paths of the mflux transformers)
MODELS = {"flux2_klein": {"4b": "flux2-klein-4b", "9b": "flux2-klein-9b"}, "krea2": "krea-2"}


def lora_targets(m, weights_dir, rank):
    if m["arch"] == "krea2":
        return [{"module_path": "blocks.{block}.%s" % p, "blocks": {"start": 0, "end": 28}, "rank": rank}
                for p in ("attn.wq", "attn.wk", "attn.wv", "attn.wo", "mlp.gate", "mlp.up", "mlp.down")]
    with open(os.path.join(weights_dir, "transformer", "config.json")) as f:
        cfg = json.load(f)
    double, single = cfg.get("num_layers", 5), cfg.get("num_single_layers", 20)
    out = [{"module_path": "transformer_blocks.{block}.%s" % p, "blocks": {"start": 0, "end": double}, "rank": rank}
           for p in ("attn.to_q", "attn.to_k", "attn.to_v", "attn.to_out", "attn.add_q_proj", "attn.add_k_proj",
                     "attn.add_v_proj", "attn.to_add_out")]
    out += [{"module_path": "single_transformer_blocks.{block}.%s" % p, "blocks": {"start": 0, "end": single}, "rank": rank}
            for p in ("attn.to_qkv_mlp_proj", "attn.to_out")]
    return out


def model_name(m):
    if m["arch"] == "krea2":
        return MODELS["krea2"]
    big = m.get("components", {}).get("transformer", 4) > 6
    return MODELS["flux2_klein"]["9b" if big else "4b"]


def choose_bits(m, ram_gb):
    """The base model is quantized (QLoRA); training needs about twice the activations of
    generating, plus the LoRA's gradients and optimizer state."""
    family = "krea2" if m["arch"] == "krea2" else "flux2"
    act = memory.ACTIVATIONS_GB.get(family, 3.0) * 2 + 2
    for bits, level in ((8, "q8"), (4, "q4")):
        p = memory.plan(m["components"], m["denoiser"], family, ram_gb, quant=level, allow_staging=False, activations_gb=act)
        if p["fits"]:
            return bits
    return 4


class Progress:
    """Stands in for tqdm in mflux's training loop: reports every step to the app."""

    last_loss = None

    def __init__(self, iterable, total=None, initial=0, **kw):
        self.iterable, self.total, self.n = iterable, total, initial

    def __iter__(self):
        t0 = time.time()
        start = self.n
        for item in self.iterable:
            yield item
            self.n += 1
            done = self.n - start
            eta = (time.time() - t0) / done * (self.total - self.n) if done else None
            emit({"phase": "training", "step": self.n, "total": self.total, "loss": Progress.last_loss,
                  "eta_s": round(eta) if eta is not None else None})


def main(job_path):
    with open(job_path) as f:
        job = json.load(f)
    base = job["base_model"]
    with open(os.path.join(base, "model.json")) as f:
        m = json.load(f)
    if m["arch"] not in ("flux2_klein", "krea2"):
        raise ValueError("MLX training supports FLUX.2 [klein] and Krea 2")
    native = m.get("layout") == "single_denoiser"
    weights_dir = os.path.join(base, m["base_dir"] if native else m["weights_dir"])

    work = Path(job["work_dir"])
    shutil.rmtree(work / "data", ignore_errors=True)
    n = prepare_images(job, work / "data", int(job.get("resolution", 512)))
    steps = int(job.get("steps", 500))
    bits = choose_bits(m, memory.total_ram_gb())
    emit({"phase": "preparing", "message": "Base model in %d bit, %d pictures" % (bits, n)})
    config = {
        "model": model_name(m), "model_path": weights_dir, "data": str(work / "data"), "seed": 42,
        "steps": int(m.get("defaults", {}).get("num_steps", 4)), "guidance": 0.0 if m["arch"] == "krea2" else 1.0,
        "quantize": bits, "max_resolution": int(job.get("resolution", 512)),
        "gradient_checkpointing": True,
        "training_loop": {"num_epochs": max(1, math.ceil(steps / n)), "batch_size": 1},
        "optimizer": {"name": "AdamW", "learning_rate": float(job.get("learning_rate", 1e-4))},
        "checkpoint": {"save_frequency": max(50, steps // 4), "output_path": str(work / "output")},
        "lora_layers": {"targets": lora_targets(m, weights_dir, int(job.get("rank", 16)))},
    }
    shutil.rmtree(work / "output", ignore_errors=True)
    cfg_path = work / "train.json"
    with open(cfg_path, "w") as f:
        json.dump(config, f, indent=1)

    import mflux.models.common.training.trainer as trainer_mod
    from mflux.models.common.training.runner import TrainingRunner
    trainer_mod.tqdm = Progress
    finite = trainer_mod.TrainingTrainer._step_is_finite

    def step_is_finite(loss):
        ok = finite(loss)
        if ok:
            Progress.last_loss = round(float(loss), 4)
        return ok
    trainer_mod.TrainingTrainer._step_is_finite = staticmethod(step_is_finite)

    emit({"phase": "loading", "message": "Loading %s and encoding the pictures" % m.get("label", m["arch"])})
    TrainingRunner.train(config_path=str(cfg_path), resume_path=None)

    ckpts = sorted((work / "output").rglob("*_checkpoint.zip"))
    if not ckpts:
        raise RuntimeError("Training produced no checkpoint")
    import zipfile
    with zipfile.ZipFile(ckpts[-1]) as z:
        adapter = [n for n in z.namelist() if n.endswith("_adapter.safetensors")][0]
        z.extract(adapter, work)
    family = "krea2" if m["arch"] == "krea2" else "flux2"
    # the sub-base too (FLUX.2 [klein] 4B or 9B): a LoRA of one size does not fit the other
    folder = write_lora_folder(job, work / adapter, family=family, base=model_name(m), variant=registry.model_variant(m),
                               training={"steps": steps, "images": n, "resolution": int(job.get("resolution", 512)),
                                         "rank": int(job.get("rank", 16)), "base_model": m.get("name"),
                                         "runtime": "mlx", "quantize": bits})
    emit({"done": folder})
