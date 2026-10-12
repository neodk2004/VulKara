# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
import pytest

import samplers


def test_labels_and_ids():
    assert samplers.normalize("DPM++ 2M") == "dpmpp_2m"
    assert samplers.normalize("dpmpp_2m") == "dpmpp_2m"
    assert samplers.normalize("Default") == "default"
    assert samplers.normalize(None) == "default"
    assert samplers.normalize("Euler (flow)") == "flow_euler"


def test_families():
    assert "dpmpp_2m" in samplers.for_family("sdxl") and "flow_euler" not in samplers.for_family("sdxl")
    assert "flow_heun" in samplers.for_family("sd3") and "ddim" not in samplers.for_family("sd3")
    assert "flow_heun" not in samplers.for_family("flux1")
    assert samplers.for_family("unknown") == []


def test_labels_match_the_form():
    """src/shared/samplers.ts lists the same labels."""
    import os
    js = open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "src", "shared", "samplers.ts")).read()
    for label, _, _, _ in samplers.SAMPLERS.values():
        assert "'%s'" % label in js, label


def test_default_needs_no_scheduler():
    assert samplers.make("Default", "Default", {"_class_name": "EulerDiscreteScheduler"}, "sdxl") is None


def test_wrong_family_is_refused():
    with pytest.raises(ValueError, match="does not work"):
        samplers.make("DDIM", "Default", {"_class_name": "FlowMatchEulerDiscreteScheduler"}, "flux1")


def test_karras_on_sdxl():
    pytest.importorskip("diffusers")
    s = samplers.make("DPM++ 2M", "Karras", {"_class_name": "EulerDiscreteScheduler", "num_train_timesteps": 1000}, "sdxl")
    assert type(s).__name__ == "DPMSolverMultistepScheduler" and s.config.use_karras_sigmas
