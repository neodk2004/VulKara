# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Step caching (step_cache.py) on a tiny FLUX transformer, also together with SSD streaming."""
import torch

import step_cache
import streaming


def tiny_flux():
    from diffusers import FluxTransformer2DModel
    torch.manual_seed(0)
    return FluxTransformer2DModel(patch_size=1, in_channels=4, num_layers=1, num_single_layers=3, attention_head_dim=8,
                                  num_attention_heads=2, joint_attention_dim=16, pooled_projection_dim=8,
                                  guidance_embeds=False, axes_dims_rope=(2, 2, 4)).eval()


def inputs(t=0.5):
    torch.manual_seed(1)
    return dict(hidden_states=torch.randn(1, 16, 4), encoder_hidden_states=torch.randn(1, 5, 16),
                pooled_projections=torch.randn(1, 8), timestep=torch.tensor([t]), img_ids=torch.zeros(16, 3),
                txt_ids=torch.zeros(5, 3), return_dict=False)


def test_levels_come_from_the_environment(monkeypatch):
    monkeypatch.delenv("VK_STEP_CACHE", raising=False)
    assert step_cache.threshold() is None
    monkeypatch.setenv("VK_STEP_CACHE", "strong")
    assert step_cache.threshold() == step_cache.LEVELS["strong"]


def test_a_model_without_known_blocks_is_left_alone():
    class Unet(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.down_blocks = torch.nn.ModuleList([torch.nn.Linear(2, 2) for _ in range(3)])
    assert not step_cache.supported(Unet())
    assert step_cache.attach(Unet(), 0.1) is None


def test_an_unchanged_step_is_reused_and_a_changed_one_computed():
    model = tiny_flux()
    with torch.no_grad():
        expected = model(**inputs())[0]
        tracker = step_cache.attach(model, 0.05)
        assert tracker is not None
        with step_cache.run(model) as t:
            first = model(**inputs())[0]
            again = model(**inputs())[0]  # the same input: the first block's output does not change
            moved = model(**inputs(t=0.9))[0]  # another time step: changes enough to be computed
    assert torch.allclose(first, expected, atol=1e-5)
    assert torch.allclose(again, expected, atol=1e-4)
    assert (t.runs, t.reused) == (3, 1)
    assert step_cache.note(t) and "1 of 3" in step_cache.note(t)
    with torch.no_grad(), step_cache.run(model) as t:  # a new picture starts with an empty cache
        model(**inputs())
    assert (t.runs, t.reused) == (1, 0) and step_cache.note(t) is None


def test_with_streaming_the_skipped_blocks_are_not_read(tmp_path, monkeypatch):
    model = tiny_flux()
    with torch.no_grad():
        expected = model(**inputs())[0]
    monkeypatch.setattr(streaming, "PROFILE", True)
    monkeypatch.setattr(torch.mps, "synchronize", lambda: None)
    monkeypatch.setattr(torch.mps, "driver_allocated_memory", lambda: 0)
    streaming.enable(model, torch.device("cpu"), torch.float32, str(tmp_path))
    step_cache.attach(model, 0.05)
    streaming.report()
    with torch.no_grad(), step_cache.run(model) as t:
        full = model(**inputs())[0]
        reads_full = streaming.STATS["blocks"]
        reused = model(**inputs())[0]
    assert torch.allclose(full, expected, atol=1e-5) and torch.allclose(reused, expected, atol=1e-4)
    assert t.reused == 1
    assert reads_full == 3  # the 3 single blocks (a list of one block is not streamed: the head stays resident)
    assert streaming.STATS["blocks"] == reads_full  # the reused run read nothing more
    assert streaming.STATS["skipped"] == 3
