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
    if torch.backends.mps.is_available():
        _plain_on_cpu()
    _patched = True


def _plain_on_cpu():
    """int4 weights made or restored on the CPU stay in quanto's plain packing: its TinyGemm layout (chosen for the CPU)
    is unpacked and packed again layer by layer when the model moves to the GPU, about 20 s per large layer (43 minutes
    for Qwen-Image 2.1's text encoder, MEASUREMENTS 7t). Nothing here computes int4 weights on the CPU."""
    from optimum.quanto.tensor.weights.qbits import WeightQBitsTensor
    create = WeightQBitsTensor.create

    def plain(qtype, axis, group_size, size, stride, data, scale, shift, requires_grad=False):
        if data.device.type == "cpu":
            return WeightQBitsTensor(qtype, axis, group_size, size, stride, data, scale, shift, requires_grad)
        return create(qtype, axis, group_size, size, stride, data, scale, shift, requires_grad)
    WeightQBitsTensor.create = staticmethod(plain)
