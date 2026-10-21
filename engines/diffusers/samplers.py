# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Samplers (diffusers schedulers) the user can pick per job.

Models come in two kinds: SDXL predicts noise ("eps"), SD 3.5 / FLUX are flow-matching models
and need schedulers that work on flow sigmas. Each sampler is built from the model's own
scheduler config, so shifts and training settings stay those of the model. Swapping the
scheduler costs nothing; the model stays loaded.

The same table (ids and labels) is used by the form: electron_app/src/utils/samplers.js
"""

# id: (label, kind, scheduler class, config overrides)
SAMPLERS = {
    # noise prediction (SDXL)
    "euler": ("Euler", "eps", "EulerDiscreteScheduler", {}),
    "euler_a": ("Euler a", "eps", "EulerAncestralDiscreteScheduler", {}),
    "dpmpp_2m": ("DPM++ 2M", "eps", "DPMSolverMultistepScheduler", {"algorithm_type": "dpmsolver++"}),
    "dpmpp_2m_sde": ("DPM++ 2M SDE", "eps", "DPMSolverMultistepScheduler", {"algorithm_type": "sde-dpmsolver++"}),
    "dpmpp_sde": ("DPM++ SDE", "eps", "DPMSolverSDEScheduler", {}),
    "unipc": ("UniPC", "eps", "UniPCMultistepScheduler", {}),
    "heun": ("Heun", "eps", "HeunDiscreteScheduler", {}),
    "ddim": ("DDIM", "eps", "DDIMScheduler", {}),
    "lms": ("LMS", "eps", "LMSDiscreteScheduler", {}),
    "deis": ("DEIS", "eps", "DEISMultistepScheduler", {}),
    "kdpm2": ("DPM2", "eps", "KDPM2DiscreteScheduler", {}),
    "kdpm2_a": ("DPM2 a", "eps", "KDPM2AncestralDiscreteScheduler", {}),
    "lcm": ("LCM", "eps", "LCMScheduler", {}),
    "tcd": ("TCD", "eps", "TCDScheduler", {}),
    # flow matching (SD 3.5, FLUX)
    "flow_euler": ("Euler (flow)", "flow", "FlowMatchEulerDiscreteScheduler", {}),
    "flow_heun": ("Heun (flow)", "flow", "FlowMatchHeunDiscreteScheduler", {}),
    "flow_dpmpp_2m": ("DPM++ 2M (flow)", "flow", "DPMSolverMultistepScheduler",
                      {"use_flow_sigmas": True, "prediction_type": "flow_prediction", "algorithm_type": "dpmsolver++"}),
    "flow_unipc": ("UniPC (flow)", "flow", "UniPCMultistepScheduler",
                   {"use_flow_sigmas": True, "prediction_type": "flow_prediction"}),
    "flow_lcm": ("LCM (flow)", "flow", "FlowMatchLCMScheduler", {}),
}

SIGMAS = {"karras": "use_karras_sigmas", "exponential": "use_exponential_sigmas", "beta": "use_beta_sigmas"}

# SD 2.x 768 px models predict v: the eps samplers take prediction_type from the model's config
FAMILY_KIND = {"sd1": "eps", "sd2": "eps", "sdxl": "eps", "sd3": "flow", "flux1": "flow", "chroma": "flow",
               "flux2": "flow", "qwen_image": "flow", "qwen_image21": "flow", "z_image": "flow"}

# known not to work with a family's pipeline
UNSUPPORTED = {
    # the FLUX, Chroma, Qwen-Image and Z-Image pipelines pass their own sigma schedule, which these schedulers can
    # not take
    "flux1": {"flow_heun", "flow_dpmpp_2m"},
    "chroma": {"flow_heun", "flow_dpmpp_2m"},
    "flux2": {"flow_heun", "flow_dpmpp_2m"},
    "qwen_image": {"flow_heun", "flow_dpmpp_2m"},
    "qwen_image21": {"flow_heun", "flow_dpmpp_2m"},
    "z_image": {"flow_heun", "flow_dpmpp_2m"},
}


_BY_LABEL = {v[0].lower(): k for k, v in SAMPLERS.items()}


def normalize(value):
    """Sampler id from an id or a label as shown in the form ("DPM++ 2M")."""
    v = str(value or "default").strip()
    if v in SAMPLERS or v.lower() == "default":
        return v if v in SAMPLERS else "default"
    return _BY_LABEL.get(v.lower(), v)  # unknown names are refused by make()


def for_family(family):
    kind = FAMILY_KIND.get(family)
    bad = UNSUPPORTED.get(family, set())
    return [s for s, v in SAMPLERS.items() if v[1] == kind and s not in bad]


def make(sampler, sigmas, base_config, family):
    """A scheduler instance, or None for the model's default (sampler "default"/unknown)."""
    import inspect

    import diffusers
    sampler, sigmas = normalize(sampler), str(sigmas or "default").lower()
    if sampler == "default" and sigmas == "default":
        return None
    if sampler == "default":
        # the model's own scheduler with another sigma schedule, or Euler if it has none
        cls = getattr(diffusers, base_config["_class_name"])
        if SIGMAS.get(sigmas) in inspect.signature(cls.__init__).parameters:
            return _build(cls, base_config, {}, sigmas)
        sampler = "flow_euler" if FAMILY_KIND.get(family) == "flow" else "euler"
    if sampler not in SAMPLERS or sampler not in for_family(family):
        raise ValueError("The sampler %s does not work with this model" % sampler)
    _, _, cls_name, overrides = SAMPLERS[sampler]
    cls = getattr(diffusers, cls_name)
    overrides = dict(overrides)
    if overrides.get("use_flow_sigmas"):
        # the model's shift (SD 3.5: 3.0) carries over to the flow sigmas
        overrides.setdefault("flow_shift", base_config.get("shift", 1.0))
        if base_config.get("use_dynamic_shifting"):
            overrides["use_dynamic_shifting"] = True
    params = inspect.signature(cls.__init__).parameters
    overrides = {k: v for k, v in overrides.items() if k in params}
    return _build(cls, base_config, overrides, sigmas)


def _build(cls, base_config, overrides, sigmas):
    import inspect
    params = inspect.signature(cls.__init__).parameters
    cfg = dict(overrides)
    if sigmas != "default":
        key = SIGMAS.get(sigmas)
        if key not in params:
            raise ValueError("The sigma schedule %s does not work with this sampler" % sigmas)
        cfg[key] = True
    return cls.from_config(base_config, **cfg)
