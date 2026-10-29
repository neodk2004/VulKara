# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Blending of VAE tiles (Qwen-Image's VAEs): the next tile takes over before the overlap ends."""
import pytest

torch = pytest.importorskip("torch")

import engine  # noqa: E402


def test_blend_reaches_the_next_tile_16_px_before_the_end():
    a = torch.ones(1, 3, 1, 8, 128)
    b = torch.zeros(1, 3, 1, 8, 128)
    out = engine._blend_h(None, a, b, 128)
    row = out[0, 0, 0, 0]
    assert row[0] == 1 and row[56] == pytest.approx(0.5, abs=0.01)
    assert torch.all(row[112:] == 0)  # the old tile's outermost 16 px are not used
    a = torch.ones(1, 3, 1, 128, 8)
    out = engine._blend_v(None, a, torch.zeros(1, 3, 1, 128, 8), 128)
    assert out[0, 0, 0, 0, 0] == 1 and torch.all(out[0, 0, 0, 112:, 0] == 0)
