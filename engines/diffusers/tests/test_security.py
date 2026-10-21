# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Untrusted input from Civitai, Hugging Face, files and jobs: hosts, paths, headers, the content filter."""
import io
import json
import os
import struct
import sys

import pytest
from PIL import Image

import civitai
import content_check
import engine
import importer
import previews
import registry


def test_civitai_key_only_goes_to_civitai_over_https():
    assert civitai.is_civitai_url("https://civitai.com/api/download/models/1")
    assert civitai.is_civitai_url("https://b2.civitai.com/file")
    for url in ("http://civitai.com/api/v1/models/1", "https://civitai.com.evil.example/x",
                "https://evil.example/civitai.com", "file:///etc/passwd", None):
        assert not civitai.is_civitai_url(url)
        with pytest.raises(civitai.CivitaiError):
            civitai._request(url, token="secret")


def test_civitai_redirect_to_http_is_refused():
    h = civitai._DropAuthOnRedirect()
    req = civitai._request("https://civitai.com/api/download/models/1", token="secret")
    with pytest.raises(civitai.CivitaiError):
        h.redirect_request(req, None, 302, "Found", {}, "http://storage.example/file")


def test_civitai_links_are_recognised_by_their_host():
    assert civitai.parse_ref("https://civitai.com/models/12?modelVersionId=34") == (12, 34)
    with pytest.raises(civitai.CivitaiError):
        civitai.parse_ref("https://civitai.com.evil.example/models/12")


class _Response(io.BytesIO):
    headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def test_civitai_download_stays_in_its_folder_and_leaves_no_partial_file(tmp_path, monkeypatch):
    data = b"weights"
    monkeypatch.setattr(civitai._opener, "open", lambda req, timeout=None: _Response(data))
    info = {"file_name": "../../evil.safetensors", "download_url": "https://civitai.com/api/download/models/1",
            "sha256": "", "size_bytes": len(data)}
    path = civitai.download(info, str(tmp_path / "dl"))
    assert os.path.dirname(path) == str(tmp_path / "dl") and open(path, "rb").read() == data

    damaged = dict(info, file_name="b.safetensors", sha256="0" * 64)
    with pytest.raises(civitai.CivitaiError):
        civitai.download(damaged, str(tmp_path / "dl"))
    assert os.listdir(tmp_path / "dl") == [os.path.basename(path)]

    dots = civitai.download(dict(info, file_name=".."), str(tmp_path / "dots"))
    assert os.path.dirname(dots) == str(tmp_path / "dots") and not os.path.basename(dots).startswith(".")

    foreign = dict(info, file_name="c.safetensors", download_url="https://evil.example/c")
    with pytest.raises(civitai.CivitaiError):
        civitai.download(foreign, str(tmp_path / "dl"), token="secret")


@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://image.civitai.com/a.jpeg", "", None])
def test_preview_pictures_come_over_https_only(url):
    with pytest.raises(ValueError):
        previews._get(url)


def test_a_preview_is_only_written_into_a_model_or_lora_folder(tmp_path):
    model = tmp_path / "model"
    model.mkdir()
    (model / "model.json").write_text(json.dumps({"defaults": {}}))
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()

    def generate(job):
        raise AssertionError("must not paint")
    with pytest.raises(ValueError):
        previews.paint(generate, {"model_dir": str(model), "target": str(elsewhere)})
    assert os.listdir(elsewhere) == []


def _safetensors(path, header_len, body=b""):
    path.write_bytes(struct.pack("<Q", header_len) + body)
    return str(path)


def test_safetensors_headers_are_capped(tmp_path):
    huge = _safetensors(tmp_path / "huge.safetensors", 2 ** 40)
    empty = _safetensors(tmp_path / "empty.safetensors", 0)
    (tmp_path / "short.safetensors").write_bytes(b"\x01")
    for p in (huge, empty, str(tmp_path / "short.safetensors")):
        for read in (registry.read_safetensors_header, registry.read_safetensors_metadata):
            with pytest.raises(registry.UnsupportedModel):
                read(p)
    header = json.dumps({"__metadata__": {"a": "b"}, "w": {"dtype": "F16", "shape": [2, 3], "data_offsets": [0, 12]}})
    ok = _safetensors(tmp_path / "ok.safetensors", len(header), header.encode() + bytes(12))
    assert registry.read_safetensors_header(ok) == {"w": [2, 3]}
    assert registry.read_safetensors_metadata(ok) == {"a": "b"}


def test_code_in_a_repo_is_not_downloaded():
    index = {"_class_name": "StableDiffusionXLPipeline", "unet": ["diffusers", "UNet2DConditionModel"],
             "custom": ["my_module", "MyModel"]}
    files = ["model_index.json", "unet/config.json", "unet/diffusion_pytorch_model.safetensors",
             "unet/my_unet.py", "custom/config.json", "custom/my_module.py", "custom/lib.so"]
    wanted, _ = importer._repo_plan_files(files, index)
    assert not [f for f in wanted if f.endswith(importer.CODE_EXTS)]
    assert "unet/config.json" in wanted


def test_a_failed_lora_import_leaves_no_folder(tmp_path, monkeypatch):
    header = json.dumps({"lora_unet_down.lora_down.weight": {"dtype": "F16", "shape": [4, 768], "data_offsets": [0, 0]}})
    src = _safetensors(tmp_path / "src.safetensors", len(header), header.encode())
    models = tmp_path / "models"
    monkeypatch.setattr(importer, "progress", lambda *a, **k: None)

    def offline(manifest, path):
        raise OSError("disk full")
    monkeypatch.setattr(importer, "_civitai_by_hash", offline)
    with pytest.raises(OSError):
        importer.import_lora("file", src, "my lora", root=str(models / "x"), family_hint="sdxl")
    assert not (models / "loras" / "my_lora").exists()


def test_lora_files_named_outside_their_folder_are_refused(tmp_path):
    folder = tmp_path / "lora"
    folder.mkdir()
    spec = {"family": "sdxl", "label": "SDXL"}
    for bad in ("../other.safetensors", "/etc/passwd"):
        (folder / "lora.json").write_text(json.dumps({"name": "x", "family": "sdxl", "file": bad}))
        with pytest.raises(ValueError):
            engine.DiffusersEngine._resolve_loras([{"path": str(folder)}], spec)
    (folder / "lora.json").write_text(json.dumps({"name": "x", "family": "sdxl", "file": "lora.safetensors"}))
    out = engine.DiffusersEngine._resolve_loras([{"path": str(folder)}], spec)
    assert out[0]["file"] == str(folder / "lora.safetensors")


class _Broken(content_check.Checker):
    def check(self, path, safe_mode=False):
        raise RuntimeError("filter model missing")


def _picture(path):
    Image.new("RGB", (16, 16), "red").save(path)
    return str(path)


def test_an_unchecked_result_is_deleted_other_files_are_kept(tmp_path, monkeypatch):
    images = tmp_path / "images"
    images.mkdir()
    monkeypatch.setenv("VK_IMAGES_DIR", str(images))
    result = _picture(images / "out.png")
    ans = content_check.handle(_Broken(), {"path": result})
    assert not ans["ok"] and not os.path.exists(result)
    other = _picture(tmp_path / "mine.png")
    assert not content_check.handle(_Broken(), {"path": other})["ok"]
    assert os.path.exists(other)


def test_a_classifier_without_the_expected_class_blocks(tmp_path):
    class Renamed(content_check.Checker):
        def _probs(self, which, images):
            return [{"normal": 0.1, "porn": 0.9}]
    ans = content_check.handle(Renamed(), {"path": _picture(tmp_path / "a.png")})
    assert not ans["ok"]


def test_requests_that_are_no_objects_are_skipped(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO('[1, 2]\n"x"\n{"id": 7, "path": ""}\n'))
    monkeypatch.setattr(content_check, "Checker", _Broken)
    assert content_check.main([]) == 0
    lines = capsys.readouterr().out.strip().splitlines()
    assert lines[0] == "ready" and len(lines) == 2
    assert json.loads(lines[1])["id"] == 7 and not json.loads(lines[1])["ok"]
