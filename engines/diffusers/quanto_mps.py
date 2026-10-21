# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""optimum-quanto's MPS kernel for unpacking int4 weights is compiled at first use and
no longer builds against current torch headers. This registers a pure torch
implementation for the MPS dispatch key instead (same algorithm as quanto's default)."""
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
    if not torch.backends.mps.is_available():
        return
    import optimum.quanto  # noqa: F401  registers the op and the compiled MPS impl
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        torch.library.impl("quanto::unpack", "MPS")(_unpack)
    _patched = True
