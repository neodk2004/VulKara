# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
import json
import struct

import pytest

import registry


def write_safetensors(path, names_shapes):
    header = {}
    offset = 0
    for name, shape in names_shapes.items():
        n = 1
        for d in shape:
            n *= d
        header[name] = {"dtype": "BF16", "shape": shape, "data_offsets": [offset, offset + 2 * n]}
        offset += 2 * n
    raw = json.dumps(header).encode()
    with open(path, "wb") as f:
        f.write(struct.pack("<Q", len(raw)))
        f.write(raw)
        f.write(b"\0" * offset)


def detect(tmp_path, keys, name="m.safetensors"):
    p = tmp_path / name
    write_safetensors(p, {k: [1] for k in keys})
    return registry.detect_from_single_file(registry.read_single_file_header(str(p)), name)


def test_sdxl_full_checkpoint(tmp_path):
    arch, layout, _, _ = detect(tmp_path, ["conditioner.embedders.1.model.ln_final.weight",
                                           "model.diffusion_model.input_blocks.0.0.weight"])
    assert (arch, layout) == ("sdxl", "single_full")


def test_sd1_runs_on_the_diffusers_engine(tmp_path):
    arch, layout, _, _ = detect(tmp_path, ["cond_stage_model.transformer.x", "model.diffusion_model.input_blocks.0.0.weight"])
    assert (arch, layout) == ("sd15", "single_full")


def test_flux1_dev_vs_schnell(tmp_path):
    base = ["img_in.weight", "double_blocks.0.img_attn.qkv.weight", "single_blocks.0.linear1.weight"]
    assert detect(tmp_path, base)[0] == "flux1_schnell"
    assert detect(tmp_path, base + ["guidance_in.in_layer.weight"], "d.safetensors")[0] == "flux1_dev"
    prefixed = ["model.diffusion_model." + k for k in base]
    assert detect(tmp_path, prefixed, "p.safetensors")[:2] == ("flux1_schnell", "single_denoiser")


def test_flux2(tmp_path):
    arch, layout, _, params = detect(tmp_path, ["single_stream_modulation.lin.weight", "double_blocks.0.x"])
    assert (arch, layout) == ("flux2_klein", "single_denoiser")


def test_sd3_depth(tmp_path):
    medium = ["joint_blocks.%d.x_block.attn.qkv.weight" % i for i in range(24)]
    large = ["joint_blocks.%d.x_block.attn.qkv.weight" % i for i in range(38)]
    assert detect(tmp_path, medium)[0] == "sd35_medium"
    assert detect(tmp_path, large, "l.safetensors")[0] == "sd35_large"


def test_unknown_and_pickle(tmp_path):
    with pytest.raises(registry.UnsupportedModel):
        detect(tmp_path, ["foo.weight"])
    with pytest.raises(registry.UnsupportedModel):
        registry.read_single_file_header(str(tmp_path / "x.ckpt"))


def test_model_index():
    assert registry.detect_from_model_index({"_class_name": "FluxPipeline"}, {"guidance_embeds": True})[0] == "flux1_dev"
    assert registry.detect_from_model_index({"_class_name": "StableDiffusion3Pipeline"}, {"num_layers": 38})[0] == "sd35_large"
    arch, ov = registry.detect_from_model_index({"_class_name": "Flux2KleinPipeline", "is_distilled": True})
    assert arch == "flux2_klein" and ov["num_steps"] == 4
    assert registry.detect_from_model_index({"_class_name": "StableDiffusionXLPipeline"}, ref="stabilityai/sdxl-turbo")[1]["num_steps"] == 4
    assert registry.detect_from_model_index({"_class_name": "StableDiffusionPipeline"})[0] == "sd15"


def test_lora_is_rejected(tmp_path):
    keys = ["diffusion_model.double_blocks.0.img_attn.qkv.lora_A.weight",
            "diffusion_model.double_blocks.0.img_attn.qkv.lora_B.weight",
            "diffusion_model.single_blocks.0.linear1.lora_A.weight"]
    with pytest.raises(registry.LoraFile):
        detect(tmp_path, keys)


def test_flux_blocks_without_input_layer_are_rejected(tmp_path):
    with pytest.raises(registry.UnsupportedModel):
        detect(tmp_path, ["double_blocks.0.img_attn.qkv.weight", "single_blocks.0.linear1.weight"])


def _meta(tags):
    return {"ss_tag_frequency": json.dumps({"img": tags})}


def test_trigger_words_of_instance_token_loras():
    assert registry.trigger_words_from_metadata(_meta({"br33zy": 1})) == ["br33zy"]
    assert registry.trigger_words_from_metadata({}) == []


def test_trigger_word_that_starts_the_training_captions():
    tags = {"t4tt00 black and white drawing tattoo of a cheshire cat": 1,
            "t4tt00 black and white drawing tattoo of a rose": 1,
            "wearing a top hat and holding a clock": 1, "surrounded by mushrooms and flowers": 1,
            "set against a white background.": 2, "a drawing of a knife with a blade": 1}
    assert registry.trigger_words_from_metadata(_meta(tags)) == ["t4tt00"]


def test_invented_tags_are_trigger_words_general_tags_are_not():
    tags = {"monochrome": 412, "1boy": 90, "no humans": 342, "tattoo_style": 112, "proto_tat": 98,
            "8k": 50, "rare_tag": 3, "flower": 76}
    assert registry.trigger_words_from_metadata(_meta(tags)) == ["tattoo_style", "proto_tat"]
    captions = {"a drawing of a landscape with trees and birds": 2, "a mushroom is growing out of the ground": 1,
                "a drawing of a knife with a sharp blade": 1, "a dagger with a black handle": 1}
    assert registry.trigger_words_from_metadata(_meta(captions)) == []


def test_instance_token_of_the_dataset_folder_is_a_trigger_word():
    captions = {"a drawing of a landscape with trees and birds": 2, "a mushroom is growing out of the ground": 1,
                "a drawing of a knife with a sharp blade": 1, "a dagger with a black handle": 1}
    meta = {"ss_dataset_dirs": json.dumps({"25_Tattoo_gen Style": {"n_repeats": 25}, "10_img": {}}), **_meta(captions)}
    assert registry.trigger_words_from_metadata(meta) == ["Tattoo_gen"]
