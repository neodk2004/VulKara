# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Noise schedules the MLX runtime hands mflux where mflux's own differ from the model's reference (diffusers with the
model's scheduler_config.json). mflux takes a scheduler as a dotted class path and builds it with its Config."""
import mlx.core as mx
from mflux.models.common.schedulers.linear_scheduler import LinearScheduler


class StaticShiftScheduler(LinearScheduler):
    """Euler on sigmas spaced evenly from 1 to 1/n, shifted by a fixed factor (FlowMatchEulerDiscreteScheduler without
    dynamic shifting, as Z-Image's configs ask: Turbo 3, Base 6). mflux shifts by the resolution instead (about 3.16
    at 1024 px for Turbo), which changes every step."""
    shift = 3.0

    def _get_sigmas(self):
        n = self.config.num_inference_steps
        s = mx.linspace(1.0, 1.0 / n, n).astype(mx.float32)
        s = self.shift * s / (1 + (self.shift - 1) * s)
        return mx.concatenate([s, mx.zeros(1)])


def static_shift(shift):
    """The dotted path of a StaticShiftScheduler with this shift, for mflux's `scheduler` argument."""
    name = "StaticShift_" + ("%g" % float(shift)).replace(".", "_")
    if name not in globals():
        globals()[name] = type(name, (StaticShiftScheduler,), {"shift": float(shift)})
    return __name__ + "." + name
