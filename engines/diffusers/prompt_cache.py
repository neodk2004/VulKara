# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Prompt embeddings on disk: a prompt encoded once needs no text encoder again, also after a restart.

Models with their text encoders apart (staged: loaded per new prompt) keep the last prompt in memory only
(LoadedModel.embed_cache); this keeps every prompt's embeddings in <data>/prompt_cache/<sha256>.safetensors. The key
holds everything the embeddings depend on: the text encoders' files, their bit size and dtype, the library versions,
the prompt and negative prompt. The oldest files go beyond VK_PROMPT_CACHE_GB (2 GB; 0 turns the cache off).
The MLX engine keeps the entries of mflux's prompt caches here as well (load_mlx, save_mlx).
"""
import hashlib
import json
import os

import paths
import protocol
import quant_cache

FORMAT = 1
SEP = "#"  # a list of tensors (Z-Image: one per prompt) is stored as name#0, name#1, ...


def root():
    return os.path.join(paths.DATA_DIR, "prompt_cache")


def limit_gb():
    try:
        return float(os.environ.get("VK_PROMPT_CACHE_GB", "2"))
    except ValueError:
        return 2.0


def key(parts, versions=None):
    """A file name for what the embeddings depend on (parts: JSON-able; versions: the libraries that made them, the
    Diffusers runtime's by default)."""
    blob = json.dumps({"format": FORMAT, "versions": versions or quant_cache._versions(), **parts}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def _path(k):
    return os.path.join(root(), k + ".safetensors")


def load(k, device=None):
    """The embeddings (kwargs for the pipeline) or None; a file that does not read is removed."""
    if k is None or limit_gb() <= 0:
        return None
    p = _path(k)
    if not os.path.exists(p):
        return None
    try:
        from safetensors.torch import load_file
        flat = load_file(p, device=str(device) if device is not None else "cpu")
        os.utime(p)  # the oldest used go first
    except Exception as e:
        protocol.log("[diffusers] prompt cache entry unusable (%s), encoding again" % e)
        try:
            os.remove(p)
        except OSError:
            pass
        return None
    out, lists = {}, {}
    for name, t in flat.items():
        base, sep, i = name.partition(SEP)
        if sep:
            lists.setdefault(base, {})[int(i)] = t
        else:
            out[name] = t
    for base, items in lists.items():
        out[base] = [items[i] for i in sorted(items)]
    return out


def save(k, kwargs):
    """Stores the embeddings; failures only cost encoding the prompt again."""
    if k is None or limit_gb() <= 0:
        return
    try:
        from safetensors.torch import save_file
        flat = {}
        for name, v in kwargs.items():
            for i, t in enumerate(v) if isinstance(v, (list, tuple)) else [(None, v)]:
                flat[name if i is None else "%s%s%d" % (name, SEP, i)] = t.detach().to("cpu").contiguous()
        os.makedirs(root(), exist_ok=True)
        p = _path(k)
        save_file(flat, p + ".tmp")
        os.replace(p + ".tmp", p)
        prune()
    except Exception as e:
        protocol.log("[diffusers] could not keep the prompt's embeddings: %s" % e)


def load_mlx(k):
    """Entries of an mflux prompt cache ({cache key: array or tuple of arrays and None}) or None."""
    if k is None or limit_gb() <= 0:
        return None
    p = _path(k)
    if not os.path.exists(p):
        return None
    try:
        import mlx.core as mx
        arrays, meta = mx.load(p, return_metadata=True)
        out = {}
        for i, e in enumerate(json.loads(meta["entries"])):
            items = [arrays.get("%d%s%d" % (i, SEP, j)) for j in range(e["n"])]
            out[tuple(e["key"])] = items[0] if e["single"] else tuple(items)
        os.utime(p)
        return out
    except Exception as e:
        protocol.log("[mlx] prompt cache entry unusable (%s), encoding again" % e)
        try:
            os.remove(p)
        except OSError:
            pass
        return None


def save_mlx(k, entries):
    """Stores mflux prompt cache entries (keys: tuples of str, int, float, None); failures only cost encoding again."""
    if k is None or limit_gb() <= 0 or not entries:
        return
    try:
        import mlx.core as mx
        arrays, meta = {}, []
        for i, (ck, v) in enumerate(entries.items()):
            single = not isinstance(v, (list, tuple))
            items = [v] if single else list(v)
            for j, a in enumerate(items):
                if a is not None:
                    arrays["%d%s%d" % (i, SEP, j)] = a
            meta.append({"key": list(ck), "single": single, "n": len(items)})
        os.makedirs(root(), exist_ok=True)
        tmp = os.path.join(root(), k + ".tmp.safetensors")  # MLX adds .safetensors to a name without it
        mx.save_safetensors(tmp, arrays, metadata={"entries": json.dumps(meta)})
        os.replace(tmp, _path(k))
        prune()
    except Exception as e:
        protocol.log("[mlx] could not keep the prompt's encodings: %s" % e)


def prune():
    """Removes the least recently used files beyond the size limit."""
    try:
        names = os.listdir(root())
    except OSError:
        return
    for f in names:
        if f.endswith(".tmp") or f.endswith(".tmp.safetensors"):  # left by a save the engine did not finish
            os.remove(os.path.join(root(), f))
    files = [os.path.join(root(), f) for f in names if f.endswith(".safetensors") and ".tmp" not in f]
    files.sort(key=os.path.getmtime, reverse=True)
    total, limit = 0, limit_gb() * 1024 ** 3
    for p in files:
        total += os.path.getsize(p)
        if total > limit:
            os.remove(p)
