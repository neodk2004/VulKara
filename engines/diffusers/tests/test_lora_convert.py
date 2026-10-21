# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""LoRA files in namings diffusers' readers do not take (lora_convert.py): converted before loading, so that their
layers land on the model's. Checked with the headers of real LoRAs (tests/fixtures/lora_headers.json.gz, shapes only):
diffusers' own reader reads the converted dict, and each layer it names must exist in the model (built on the meta
device from the real config, no weights) with the LoRA's input width."""
import gzip
import json
import os

import pytest
import torch

import diffusers
import engine
import lora_convert

with gzip.open(os.path.join(os.path.dirname(__file__), "fixtures", "lora_headers.json.gz"), "rt") as f:
    LORAS = json.load(f)

FLUX1 = {"attention_head_dim": 128, "guidance_embeds": True, "in_channels": 64, "joint_attention_dim": 4096,
         "num_attention_heads": 24, "num_layers": 19, "num_single_layers": 38, "patch_size": 1, "pooled_projection_dim": 768}
KLEIN9 = {"attention_head_dim": 128, "axes_dims_rope": [32, 32, 32, 32], "eps": 1e-06, "guidance_embeds": False,
          "in_channels": 128, "joint_attention_dim": 12288, "mlp_ratio": 3.0, "num_attention_heads": 32, "num_layers": 8,
          "num_single_layers": 24, "out_channels": None, "patch_size": 1, "rope_theta": 2000, "timestep_guidance_channels": 256}
QWEN21 = {"attention_head_dim": 128, "axes_dims_rope": [16, 56, 56], "context_in_dim": 4096, "in_channels": 64,
          "num_attention_heads": 32, "num_layers": 32, "out_channels": 64, "patch_size": 1, "mlp_ratio": 3, "eps": 1e-06,
          "causal_condition": True}
SDXL = {"addition_embed_type": "text_time", "addition_time_embed_dim": 256, "attention_head_dim": [5, 10, 20],
        "block_out_channels": [320, 640, 1280], "cross_attention_dim": 2048,
        "down_block_types": ["DownBlock2D", "CrossAttnDownBlock2D", "CrossAttnDownBlock2D"], "in_channels": 4,
        "layers_per_block": 2, "out_channels": 4, "projection_class_embeddings_input_dim": 2816, "sample_size": 128,
        "transformer_layers_per_block": [1, 2, 10], "up_block_types": ["CrossAttnUpBlock2D", "CrossAttnUpBlock2D", "UpBlock2D"],
        "use_linear_projection": True}

# pipeline -> (its denoiser's class, config, component)
TARGETS = {
    "FluxPipeline": ("FluxTransformer2DModel", FLUX1, "transformer"),
    "Flux2KleinPipeline": ("Flux2Transformer2DModel", KLEIN9, "transformer"),
    "QwenImage21Pipeline": ("QwenImage21Transformer2DModel", QWEN21, "transformer"),
    "StableDiffusionXLPipeline": ("UNet2DConditionModel", SDXL, "unet"),
}
_models = {}


def stand_in(pipeline):
    """Only the class name matters to lora_convert."""
    return type(pipeline, (), {})()


def tensors(name):
    """The fixture's LoRA as zeros, rank 1 (the smaller side of each matrix: the rank does not matter here)."""
    out = {}
    for k, s in LORAS[name]["shapes"].items():
        if k.endswith(".alpha") or not s:
            out[k] = torch.tensor(1.0)
        elif len(s) >= 2:
            small = s.index(min(s[:2]))
            out[k] = torch.zeros(*[1 if i == small else d for i, d in enumerate(s)], dtype=torch.float16)
        else:
            out[k] = torch.zeros(*s, dtype=torch.float16)
    return out


def coverage(pipeline, sd):
    """(share of the layers diffusers' reader names that exist with the LoRA's input width, number of layers)."""
    cls, config, comp = TARGETS[pipeline]
    if not hasattr(diffusers, cls) or not hasattr(diffusers, pipeline):
        pytest.skip("this diffusers has no %s" % cls)
    if cls not in _models:
        with torch.device("meta"):
            _models[cls] = getattr(diffusers, cls).from_config(config)
    model = _models[cls]
    kw = {"unet_config": model.config} if comp == "unet" else {}
    res = getattr(diffusers, pipeline).lora_state_dict(dict(sd), **kw)
    out = res[0] if isinstance(res, tuple) else res
    mods = dict(model.named_modules())
    layers = [(k[len(comp) + 1:].replace(".lora.down.weight", ".lora_A.weight")[:-len(".lora_A.weight")], v)
              for k, v in out.items() if k.startswith(comp + ".") and k.endswith((".lora_A.weight", ".lora.down.weight"))]
    ok = sum(1 for n, v in layers if n in mods and getattr(mods[n], "weight", None) is not None
             and mods[n].weight.shape[1] == v.shape[1])
    return (ok / len(layers) if layers else 0.0), len(layers)


# fixture, pipeline, layers diffusers reads after the conversion (all of them land on the model)
CASES = [
    ("chroma_aitoolkit_comfy", "FluxPipeline", 418),     # FLUX.1 names of ComfyUI / ai-toolkit (BFL, peft factors)
    ("klein9_peft_dump", "Flux2KleinPipeline", 140),     # peft dump: ".default.", no prefix
    ("qwen21_aitoolkit", "QwenImage21Pipeline", 224),    # fused img_mlp.gate_up split in two
    ("sdxl_aitoolkit_lora_transformer", "StableDiffusionXLPipeline", 162),  # ai-toolkit's lora_transformer_
    ("sdxl_dora_mixed_prefixes", "StableDiffusionXLPipeline", 66),          # lora_unet_ and diffusion_model_ mixed
]


@pytest.mark.parametrize("name, pipeline, layers", CASES)
def test_converted_loras_land_on_the_model(name, pipeline, layers):
    sd = tensors(name)
    pipe = stand_in(pipeline)
    assert lora_convert._needs(lora_convert._kind(pipe), list(sd))  # this file is one of the converted kinds
    assert coverage(pipeline, lora_convert.convert(pipe, sd)) == (1.0, layers)
    before, _ = coverage(pipeline, sd)
    assert before < engine.LoadedModel.MIN_APPLIED  # without the conversion it did not fit (0 % or 83 %)


@pytest.mark.parametrize("name, pipeline", [("flux1_kohya_meta", "FluxPipeline"), ("flux1_aitoolkit_meta", "FluxPipeline"),
                                            ("klein9_aitoolkit", "Flux2KleinPipeline"), ("sdxl_kohya_te", "StableDiffusionXLPipeline"),
                                            ("illustrious_stabilizer_diffusers_names", "StableDiffusionXLPipeline")])
def test_files_diffusers_reads_as_they_are_stay_as_they_are(name, pipeline):
    sd = tensors(name)
    assert not lora_convert._needs(lora_convert._kind(stand_in(pipeline)), list(sd))
    assert lora_convert.prepare(stand_in(pipeline), sd) is sd
    assert coverage(pipeline, sd)[0] == 1.0


def test_qwen_image_21_gate_up_is_split_gate_rows_first():
    """ComfyUI fuses the SwiGLU gate and up projections, gate rows first; diffusers 0.41 names them
    img_mlp.gate_layer and img_mlp.proj (12288 x 4096 each)."""
    b = torch.arange(24.0).reshape(24, 1)
    a = torch.ones(1, 8)
    sd = {"diffusion_model.transformer_blocks.0.img_mlp.gate_up.lora_A.weight": a,
          "diffusion_model.transformer_blocks.0.img_mlp.gate_up.lora_B.weight": b,
          "diffusion_model.transformer_blocks.0.attn.to_q.lora_A.weight": a,
          "lora_unet_transformer_blocks_1_img_mlp_gate_up.lora_up.weight": b,
          "lora_unet_transformer_blocks_1_img_mlp_gate_up.alpha": torch.tensor(8.0)}
    out = lora_convert.split_gate_up(sd)
    gate = out["diffusion_model.transformer_blocks.0.img_mlp.gate_layer.lora_B.weight"]
    proj = out["diffusion_model.transformer_blocks.0.img_mlp.proj.lora_B.weight"]
    assert gate.flatten().tolist() == list(range(12)) and proj.flatten().tolist() == list(range(12, 24))
    assert torch.equal(out["diffusion_model.transformer_blocks.0.img_mlp.proj.lora_A.weight"], a)
    assert out["lora_unet_transformer_blocks_1_img_mlp_gate_layer.lora_up.weight"].shape == (12, 1)
    assert float(out["lora_unet_transformer_blocks_1_img_mlp_proj.alpha"]) == 8.0
    assert "diffusion_model.transformer_blocks.0.attn.to_q.lora_A.weight" in out
    assert not [k for k in out if "gate_up" in k]


def test_qwen_image_21_names_of_the_split_are_the_runtimes():
    if not hasattr(diffusers, "QwenImage21Transformer2DModel"):
        pytest.skip("this diffusers has no Qwen-Image 2.1")
    with torch.device("meta"):
        model = diffusers.QwenImage21Transformer2DModel.from_config(QWEN21)
    mlp = model.transformer_blocks[0].img_mlp
    assert tuple(mlp.gate_layer.weight.shape) == tuple(mlp.proj.weight.shape) == (12288, 4096)


def test_peft_dumps_get_their_prefix():
    a = torch.zeros(1, 4)
    sd = {"base_model.model.transformer_blocks.0.attn.to_q.lora_A.default.weight": a,
          "single_transformer_blocks.0.attn.to_out.lora_B.default.weight": a}
    out = lora_convert.convert(stand_in("Flux2KleinPipeline"), sd)
    assert set(out) == {"transformer.transformer_blocks.0.attn.to_q.lora_A.weight",
                        "transformer.single_transformer_blocks.0.attn.to_out.lora_B.weight"}


@pytest.mark.parametrize("key, kind", [("lora_unet_input_blocks_4_1_proj_in.lokr_w1", "LoKr"),
                                       ("lora_unet_input_blocks_4_1_proj_in.hada_w1_a", "LoHa")])
def test_lokr_and_loha_are_refused_by_name(tmp_path, key, kind):
    from safetensors.torch import save_file
    path = str(tmp_path / "lyco.safetensors")
    save_file({key: torch.zeros(2, 2)}, path)
    with pytest.raises(lora_convert.UnsupportedLoraFormat, match="LoKr/LoHa LoRAs are not supported yet") as e:
        engine._check_lora_format({"file": path, "name": "Hands"})
    assert "The LoRA Hands is a LyCORIS %s file" % kind in str(e.value)
    with pytest.raises(lora_convert.UnsupportedLoraFormat):
        lora_convert.prepare(stand_in("StableDiffusionXLPipeline"), path)
    # the real SDXL LoKr file
    with pytest.raises(lora_convert.UnsupportedLoraFormat, match="LoKr"):
        lora_convert.check_format(LORAS["lokr_sdxl"]["shapes"], "x")


def test_a_lokr_lora_stops_before_loading():
    m = engine.LoadedModel.__new__(engine.LoadedModel)
    m.m, m.spec, m.stream, m.lora_key, m.separate_text = {"denoiser": "unet"}, {"label": "SDXL"}, False, (), False

    class Pipe:
        unloaded = False

        def unload_lora_weights(self):
            Pipe.unloaded = True

        def load_lora_weights(self, *a, **k):
            raise AssertionError("must not load")
    import tempfile
    from safetensors.torch import save_file
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "l.safetensors")
        save_file({"lora_unet_x.lokr_w1": torch.zeros(2, 2)}, path)
        m.pipe = Pipe()
        with pytest.raises(ValueError, match="The LoRA Hands is a LyCORIS LoKr file"):
            m.apply_loras([{"file": path, "scale": 1.0, "name": "Hands"}])
    assert Pipe.unloaded


class _QuantoLike(torch.nn.Module):
    """A transformer whose state dict names its weights the way quanto does (`x.weight._data`, `x.weight._scale`)."""

    def __init__(self):
        super().__init__()
        self.proj = torch.nn.Linear(8, 4)

    def state_dict(self, *args, **kwargs):
        sd = super().state_dict(*args, **kwargs)
        w = sd.pop("proj.weight")
        sd["proj.weight._data"], sd["proj.weight._scale"] = w, torch.ones(1)
        return sd


def test_quantized_weights_get_plain_names_while_a_lora_loads():
    # the FLUX/Chroma loader looks up `x.weight` and failed with a KeyError on a quantized Chroma
    t = _QuantoLike()
    with engine._plain_weight_names(t):
        assert tuple(t.state_dict()["proj.weight"].shape) == (4, 8)
    assert "proj.weight" not in t.state_dict()
    assert "state_dict" not in vars(t)
    with engine._plain_weight_names(None):
        pass
