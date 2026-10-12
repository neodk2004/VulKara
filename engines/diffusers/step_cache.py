# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Step caching: steps whose result barely changes are not computed in full (Settings → Engine → Step caching).

diffusers' First Block Cache, the idea of TeaCache: every step computes only the denoiser's first block and compares
how much its output changed against the step before. Below a threshold the other blocks are skipped and their last
change is added again. With SSD streaming the skipped blocks are not even read (streaming.py asks `_stream_needed`).

Only for denoisers whose blocks diffusers' block registry knows: FLUX.1 (measured, MEASUREMENTS.md) and some others
of diffusers; FLUX.2, Qwen-Image 2.1 and Z-Image are not among them (diffusers 0.41, checked 2026-10-11), and a UNet
(SD 1.x, SDXL) and Chroma's blocks are left as they are. The pictures differ slightly from a full run.
"""
import contextlib
import os

LEVELS = {"off": None, "light": 0.05, "strong": 0.12}
LEADER = "fbc_leader_block_hook"


def threshold():
    """The threshold of VK_STEP_CACHE (off, light, strong); None = off."""
    return LEVELS.get(os.environ.get("VK_STEP_CACHE", "off"))


def _blocks(denoiser):
    """The repeated blocks diffusers' cache would hook, in order: [(list name, ModuleList)]."""
    import torch
    from diffusers.hooks._common import _ALL_TRANSFORMER_BLOCK_IDENTIFIERS
    return [(name, child) for name, child in denoiser.named_children()
            if name in _ALL_TRANSFORMER_BLOCK_IDENTIFIERS and isinstance(child, torch.nn.ModuleList)]


def supported(denoiser):
    """Whether every block the cache would hook is one diffusers knows, and the model takes a cache context."""
    try:
        from diffusers.hooks._helpers import TransformerBlockRegistry
    except ImportError:
        return False
    if not hasattr(denoiser, "cache_context"):
        return False
    lists = _blocks(denoiser)
    if not lists or sum(len(lst) for _, lst in lists) < 3:
        return False
    try:
        for _, lst in lists:
            for block in lst:
                TransformerBlockRegistry.get(type(block))
    except Exception:
        return False
    return True


class Tracker:
    """Counts the denoiser's runs and how many of them were taken from the cache."""

    def __init__(self, leader):
        self.leader = leader
        self.runs = 0
        self.reused = 0

    def needed(self):
        """Whether the current run computes all blocks (asked by streaming before it reads a block)."""
        return self.leader.state_manager.get_state().should_compute

    def counted(self, module, args, output):
        self.runs += 1
        if not self.needed():
            self.reused += 1
        return output


def attach(denoiser, level_threshold):
    """Puts the cache on the denoiser; returns its Tracker, or None when the denoiser is not supported."""
    if level_threshold is None or not supported(denoiser):
        return None
    from diffusers.hooks import FirstBlockCacheConfig, HookRegistry, apply_first_block_cache
    apply_first_block_cache(denoiser, FirstBlockCacheConfig(threshold=level_threshold))
    hooked = [block for _, lst in _blocks(denoiser) for block in lst]
    leader = HookRegistry.check_if_exists_or_initialize(hooked[0]).get_hook(LEADER)
    if leader is None:
        return None
    for block in hooked[1:]:
        block._step_cache_skippable = True  # blocks the cache may skip (streaming does not read them then)
    tracker = Tracker(leader)
    denoiser.register_forward_hook(tracker.counted)
    denoiser._stream_needed = tracker.needed
    denoiser._step_cache = tracker
    return tracker


@contextlib.contextmanager
def run(denoiser):
    """One picture: the cache starts empty, and pipelines that set no cache context of their own get one."""
    tracker = getattr(denoiser, "_step_cache", None)
    if tracker is None:
        yield None
        return
    from diffusers.hooks import HookRegistry
    HookRegistry.check_if_exists_or_initialize(denoiser).reset_stateful_hooks(recurse=True)
    tracker.runs = tracker.reused = 0
    with denoiser.cache_context("vk"):
        yield tracker


def note(tracker):
    """The job's note, None when nothing was reused."""
    if tracker is None or not tracker.reused:
        return None
    return ("Step caching: %d of %d denoising runs reused from the step before (faster; the picture differs slightly "
            "from a full run)" % (tracker.reused, tracker.runs))
