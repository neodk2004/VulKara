# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""optimum-quanto's MPS and CPU kernels for unpacking int4 weights are compiled at first use: the MPS one no longer
builds against current torch headers, the CPU one needs a compiler and fails under a path with a space (torch passes
"-L.../Application Support/..." unquoted), which made every quantized cache unusable. This registers a pure torch
implementation for both dispatch keys instead (same algorithm as quanto's default)."""
import warnings

_patched = False


def _unpack(packed, bits):
    import torch
    values_per_item = 8 // bits
    unpacked = []
    for i in range(values_per_item):
        mask = 2 ** (bits * (i + 1)) - 1
        unpacked.append((packed & mask) // (2 ** (bits * i)))  # rshift is not supported on MPS
    return torch.cat(unpacked).to(torch.uint8)


def patch():
    global _patched
    if _patched:
        return
    import torch
    import optimum.quanto  # noqa: F401  registers the op and the compiled impls
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for key in ("MPS", "CPU") if torch.backends.mps.is_available() else ("CPU",):
            torch.library.impl("quanto::unpack", key)(_unpack)
    _patched = True
