# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Round trip of the quantized-weights cache with tiny, locally created text encoders."""
import os

import pytest

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")
pytest.importorskip("optimum.quanto")

import quant_cache  # noqa: E402

MODELS = {
    # tied embeddings, "wo" kept in float32 by transformers
    "t5": lambda: transformers.T5EncoderModel(transformers.T5Config(
        vocab_size=128, d_model=64, d_kv=16, d_ff=128, num_layers=2, num_heads=4)),
    # rotary tables are non-persistent buffers, missing from any state dict
    "qwen3": lambda: transformers.Qwen3Model(transformers.Qwen3Config(
        vocab_size=128, hidden_size=64, intermediate_size=128, num_hidden_layers=2, num_attention_heads=4,
        num_key_value_heads=2, head_dim=16)),
}


@pytest.mark.parametrize("kind", sorted(MODELS))
def test_round_trip(tmp_path, kind):
    torch.manual_seed(0)
    folder = str(tmp_path / "src")
    comp = "text_encoder"
    MODELS[kind]().save_pretrained(os.path.join(folder, comp))
    cls = type(MODELS[kind]())
    dtype = torch.bfloat16
    quantized = cls.from_pretrained(folder, subfolder=comp, dtype=dtype,
                                    quantization_config=transformers.QuantoConfig(weights="int8"))
    ids = torch.randint(0, 128, (1, 12))
    with torch.no_grad():
        ref = quantized(ids)[0].float()

    model_dir = str(tmp_path / "model")
    os.makedirs(model_dir)
    quant_cache.save(model_dir, folder, comp, "q8", dtype, quantized)
    assert os.path.isfile(os.path.join(quant_cache.cache_dir(model_dir, comp, "q8"), "model.safetensors"))

    def make_empty():
        with torch.device("meta"):
            return cls._from_config(cls.config_class.from_pretrained(folder, subfolder=comp), dtype=dtype)

    restored = quant_cache.load(model_dir, folder, comp, "q8", dtype, make_empty)
    assert restored is not None
    with torch.no_grad():
        got = restored(ids)[0].float()
    assert torch.equal(ref, got)
    if kind == "t5":
        assert restored.shared.weight is restored.encoder.embed_tokens.weight


def test_outdated_cache_is_dropped(tmp_path):
    folder = str(tmp_path / "src")
    comp = "text_encoder"
    MODELS["t5"]().save_pretrained(os.path.join(folder, comp))
    model = transformers.T5EncoderModel.from_pretrained(folder, subfolder=comp, dtype=torch.bfloat16,
                                                        quantization_config=transformers.QuantoConfig(weights="int8"))
    model_dir = str(tmp_path / "model")
    os.makedirs(model_dir)
    quant_cache.save(model_dir, folder, comp, "q8", torch.bfloat16, model)
    # the source changes (re-import): the cache must not be used
    weights = os.path.join(folder, comp, "model.safetensors")
    os.utime(weights, (1, 1))
    assert quant_cache.load(model_dir, folder, comp, "q8", torch.bfloat16, lambda: None) is None
    assert not os.path.exists(quant_cache.cache_dir(model_dir, comp, "q8"))
