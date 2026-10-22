# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""A LoRA weight that peft left on the CPU is brought onto the GPU before the first step."""
import pytest

torch = pytest.importorskip("torch")
peft = pytest.importorskip("peft")
from engine import place_adapters  # noqa: E402

DEVICE = "mps" if torch.backends.mps.is_available() else None


@pytest.mark.skipif(DEVICE is None, reason="needs a second device next to the CPU")
def test_lora_weights_left_on_the_cpu_are_moved_to_the_device():
    model = torch.nn.Sequential(torch.nn.Linear(4, 4), torch.nn.Linear(4, 2)).to(DEVICE)
    peft.inject_adapter_in_model(peft.LoraConfig(r=2, target_modules=["0", "1"]), model, adapter_name="lora0")
    model.to(DEVICE)
    # peft skipped the move for one adapter: its weights stay where the file was read, on the CPU
    model[1].lora_A["lora0"].to("cpu")
    model[1].lora_B["lora0"].to("cpu")
    with pytest.raises(RuntimeError):
        model(torch.ones(1, 4, device=DEVICE))

    strays = place_adapters(model, DEVICE)
    assert strays == ["1.lora_A.lora0.weight", "1.lora_B.lora0.weight"]
    assert all(p.device.type == DEVICE for p in model.parameters())
    model(torch.ones(1, 4, device=DEVICE))
    # nothing to do the second time
    assert place_adapters(model, DEVICE) == []
