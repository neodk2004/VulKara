# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Prompt embeddings on disk (prompt_cache): round trip, what the key depends on, the size limit, broken files."""
import os

import pytest

torch = pytest.importorskip("torch")

import prompt_cache  # noqa: E402


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(prompt_cache, "root", lambda: str(tmp_path))
    monkeypatch.setenv("VK_PROMPT_CACHE_GB", "2")
    return tmp_path


def test_round_trip_keeps_tensors_lists_and_masks(cache):
    kwargs = {"prompt_embeds": [torch.randn(3, 8), torch.randn(5, 8)],  # Z-Image: one tensor per prompt
              "prompt_embeds_mask": torch.tensor([[1, 1, 0]], dtype=torch.int64),
              "pooled_prompt_embeds": torch.randn(1, 4, dtype=torch.float16)}
    k = prompt_cache.key({"prompt": "a fox"})
    assert prompt_cache.load(k) is None
    prompt_cache.save(k, kwargs)
    out = prompt_cache.load(k)
    assert [t.shape for t in out["prompt_embeds"]] == [(3, 8), (5, 8)]
    assert all(torch.equal(a, b) for a, b in zip(out["prompt_embeds"], kwargs["prompt_embeds"]))
    assert torch.equal(out["prompt_embeds_mask"], kwargs["prompt_embeds_mask"])
    assert out["pooled_prompt_embeds"].dtype == torch.float16


def test_key_follows_what_the_embeddings_depend_on():
    base = {"prompt": "a fox", "negative": "", "text": {"text_encoder": [None, "none"]}}
    k = prompt_cache.key(base)
    assert k == prompt_cache.key(dict(base))
    assert k != prompt_cache.key({**base, "prompt": "a cat"})
    assert k != prompt_cache.key({**base, "text": {"text_encoder": [None, "q4"]}})  # another bit size


def test_oldest_go_beyond_the_limit_and_broken_files_are_dropped(cache, monkeypatch):
    big = {"prompt_embeds": torch.zeros(1024, 256)}  # 1 MB
    monkeypatch.setenv("VK_PROMPT_CACHE_GB", str(2.5 / 1024))
    keys = [prompt_cache.key({"prompt": str(i)}) for i in range(3)]
    for i, k in enumerate(keys):
        prompt_cache.save(k, big)
        os.utime(os.path.join(cache, k + ".safetensors"), (i, i))
    (cache / "left.safetensors.tmp").write_bytes(b"half")
    prompt_cache.prune()
    assert [prompt_cache.load(k) is None for k in keys] == [True, False, False]
    assert not (cache / "left.safetensors.tmp").exists()
    (cache / (keys[1] + ".safetensors")).write_bytes(b"broken")
    assert prompt_cache.load(keys[1]) is None and not (cache / (keys[1] + ".safetensors")).exists()
    monkeypatch.setenv("VK_PROMPT_CACHE_GB", "0")  # off
    assert prompt_cache.load(keys[2]) is None
