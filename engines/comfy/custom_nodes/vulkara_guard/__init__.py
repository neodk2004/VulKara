# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""VulKara's lock on ComfyUI's server. ComfyUI listens on 127.0.0.1 without a password, so any program on the Mac (and
a web page in a browser, through the loopback address) could send it work. The app starts ComfyUI with a random key
in VK_COMFY_TOKEN; every request without that key in the header X-VK-Token is refused. A browser page can not set
such a header across origins without a preflight that ComfyUI does not answer, so it is shut out too.

Loaded as a custom node (it has no nodes): ComfyUI imports custom nodes after its web application is made and
before it starts serving, which is when middlewares can still be added. The engine checks after the start that a
request without the key is refused, and stops ComfyUI otherwise (engines/comfy/main.py).
"""
import hmac
import os

from aiohttp import web
from server import PromptServer

TOKEN = os.environ.get("VK_COMFY_TOKEN", "")
HEADER = "X-VK-Token"


@web.middleware
async def vulkara_guard(request, handler):
    given = request.headers.get(HEADER, "")
    if not TOKEN or not hmac.compare_digest(given.encode(), TOKEN.encode()):
        return web.Response(status=403, text="forbidden")
    return await handler(request)


PromptServer.instance.app.middlewares.append(vulkara_guard)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
