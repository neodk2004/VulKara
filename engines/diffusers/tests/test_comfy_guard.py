# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""The lock on ComfyUI's server (engines/comfy/custom_nodes/vulkara_guard): only requests with the key get through.
Needs aiohttp, which the ComfyUI runtime has (skipped elsewhere)."""
import asyncio
import importlib.util
import os
import sys
import types

import pytest

aiohttp = pytest.importorskip("aiohttp")
from aiohttp import web  # noqa: E402
from aiohttp.test_utils import TestClient, TestServer  # noqa: E402

GUARD = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                     "comfy", "custom_nodes", "vulkara_guard", "__init__.py")


def _app_with_guard(monkeypatch, token):
    app = web.Application()
    app.router.add_get("/system_stats", lambda request: web.json_response({"ok": True}))
    # ComfyUI's PromptServer as the guard finds it when ComfyUI loads custom nodes
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(app=app))
    monkeypatch.setitem(sys.modules, "server", server)
    monkeypatch.setenv("VK_COMFY_TOKEN", token)
    spec = importlib.util.spec_from_file_location("vulkara_guard_test", GUARD)
    spec.loader.exec_module(importlib.util.module_from_spec(spec))
    return app


def test_only_requests_with_the_key_get_through(monkeypatch):
    app = _app_with_guard(monkeypatch, "secret-key")

    async def run():
        async with TestClient(TestServer(app)) as client:
            ok = await client.get("/system_stats", headers={"X-VK-Token": "secret-key"})
            none = await client.get("/system_stats")
            wrong = await client.get("/system_stats", headers={"X-VK-Token": "guess"})
            return ok.status, none.status, wrong.status

    assert asyncio.run(run()) == (200, 403, 403)


def test_without_a_key_from_the_app_nothing_gets_through(monkeypatch):
    app = _app_with_guard(monkeypatch, "")

    async def run():
        async with TestClient(TestServer(app)) as client:
            return (await client.get("/system_stats", headers={"X-VK-Token": ""})).status

    assert asyncio.run(run()) == 403
