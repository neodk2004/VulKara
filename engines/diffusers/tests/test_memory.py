# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
import memory
import registry


def plan(arch, ram, **kw):
    spec = registry.ARCHS[arch]
    return memory.plan(spec["fallback_params"], spec["denoiser"], spec["family"], ram, **kw)


def test_sdxl_fits_everywhere_unquantized():
    for ram in (16, 24, 64):
        p = plan("sdxl", ram)
        assert p["fits"] and p["quant"]["unet"] == "none" and not p["staged_text_encoder"]


def test_flux1_on_24gb_is_quantized_and_fits():
    p = plan("flux1_schnell", 24)
    assert p["fits"]
    assert p["quant"]["transformer"] in ("q8", "q4")
    assert p["est_peak_gb"] <= memory.budget_gb(24)


def test_flux1_on_64gb_full_precision():
    p = plan("flux1_dev", 64)
    assert p["fits"] and p["quant"]["transformer"] == "none"


def test_flux2_dev_rejected_on_24gb():
    p = plan("flux2_dev", 24)
    assert not p["fits"] and p["min_ram_gb"] > 24
    assert plan("flux2_dev", 64, quant="q4")["fits"]  # 4 bit must be chosen explicitly
    assert plan("flux2_dev", 96)["fits"]


def test_flux2_klein_fits_16gb():
    assert plan("flux2_klein", 16)["fits"]


def test_gguf_denoiser_size_is_fixed():
    spec = registry.ARCHS["flux1_schnell"]
    p = memory.plan(spec["fallback_params"], "transformer", "flux1", 24, denoiser_fixed_gb=6.8)
    assert p["fits"] and p["quant"]["transformer"] == "gguf"


def test_forced_quant():
    p = plan("sdxl", 64, quant="q8")
    assert p["quant"]["unet"] == "q8"


def test_flux1_gguf_q8_fits_24gb_with_quantized_t5():
    spec = registry.ARCHS["flux1_dev"]
    p = memory.plan(spec["fallback_params"], "transformer", "flux1", 24, denoiser_fixed_gb=12.7)
    assert p["fits"] and p["quant"]["text_encoder_2"] in ("q8", "q4")


def test_budget_reserve():
    assert memory.budget_gb(16) == 12
    assert abs(memory.budget_gb(64) - 51.2) < 1e-6
    assert memory.budget_gb(memory.ram_needed_gb(20)) >= 20 - 1e-9


def test_auto_never_picks_quanto_4bit():
    for arch in registry.ARCHS:
        spec = registry.ARCHS[arch]
        for ram in (8, 16, 24, 48, 96):
            p = memory.plan(spec["fallback_params"], spec["denoiser"], spec["family"], ram)
            assert "q4" not in p["quant"].values(), (arch, ram, p)
