# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Test matrix for imported models: resolutions, steps, guidance, img2img.

    .venv/bin/python tools/bench.py <model_dir> [<model_dir> ...] --out <dir> [--quick]

For every case it records success, time, the first/following step time and the peak
memory of the process, and writes results.json, results.md and a contact sheet.
"""
import argparse
import json
import os
import sys
import threading
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")

import psutil  # noqa: E402

PROMPT = "a red fox sitting in a snowy forest, golden hour, highly detailed photo"


def _gpu_bytes():
    # memory the Metal driver holds for this process; not part of RSS on Apple Silicon
    try:
        import torch
        if torch.backends.mps.is_available():
            return torch.mps.driver_allocated_memory()
    except Exception:
        pass
    return 0


class PeakMemory:
    """Samples resident memory + Metal driver memory of this process."""

    def __init__(self):
        self.peak = 0
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        p = psutil.Process()
        while not self._stop.wait(0.2):
            self.peak = max(self.peak, p.memory_info().rss + _gpu_bytes())

    def __enter__(self):
        self.peak = psutil.Process().memory_info().rss + _gpu_bytes()
        self._t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()
        self._t.join()


def cases(manifest, quick, max_steps=None, sizes=None):
    d = manifest["defaults"]
    steps, cfg = d["num_steps"], d["guidance_scale"]
    if max_steps:
        steps = min(steps, max_steps)
    base = d["width"]
    if sizes:
        sizes = [tuple(int(x) for x in s.split("x")) for s in sizes]
        base = sizes[-1][0]
    elif quick:
        sizes = [(base // 2, base // 2), (base, base)]
    else:
        sizes = [(base // 2, base // 2), (base * 3 // 4, base), (base, base), (base * 5 // 4, base * 5 // 4)]
    out = []
    for w, h in sizes:
        out.append({"name": "%dx%d" % (w, h), "width": w, "height": h, "num_steps": steps,
                    "guidance_scale": cfg})
    if not quick:
        out.append({"name": "few steps", "width": base, "height": base,
                    "num_steps": max(2, steps // 3), "guidance_scale": cfg})
        if manifest.get("negative_prompt"):
            out.append({"name": "negative prompt, cfg+2", "width": base, "height": base,
                        "num_steps": steps, "guidance_scale": cfg + 2, "negative_prompt": "blurry, low quality"})
    if manifest.get("img2img"):
        out.append({"name": "img2img", "width": base, "height": base, "num_steps": steps,
                    "guidance_scale": cfg, "strength": 0.6, "img2img": True})
    return out


def run_model(model_dir, out_dir, quick, max_steps=None, sizes=None):
    from engine import DiffusersEngine
    import protocol

    manifest = json.load(open(os.path.join(model_dir, "model.json")))
    name = manifest["name"]
    results = []
    step_times = []

    orig_progress = protocol.progress

    def progress(value):
        if value != -1:
            step_times.append(time.time())
    protocol.progress = progress

    engine = DiffusersEngine(images_dir=os.path.join(out_dir, name))
    first_image = None
    for c in cases(manifest, quick, max_steps, sizes):
        job = {"prompt": PROMPT, "model_dir": model_dir, "seed": 42, "count": 1, **c}
        if c.get("img2img"):
            if not first_image:
                continue
            job["input_image"] = first_image
            job["exact_size"] = True
        step_times.clear()
        r = {"model": name, "arch": manifest["arch"], "case": c["name"], "size": "%dx%d" % (c["width"], c["height"]),
             "steps": c["num_steps"], "cfg": c["guidance_scale"]}
        t0 = time.time()
        try:
            with PeakMemory() as mem:
                paths = engine.generate(job)
            r.update(ok=True, seconds=round(time.time() - t0, 1), peak_gb=round(mem.peak / 1024 ** 3, 1),
                     image=paths[0], plan=engine.model.plan)
            if len(step_times) > 2:
                r["s_per_step"] = round((step_times[-1] - step_times[1]) / (len(step_times) - 2), 2)
            first_image = first_image or paths[0]
        except Exception as e:
            r.update(ok=False, seconds=round(time.time() - t0, 1), error="%s: %s" % (type(e).__name__, str(e)[:300]))
            traceback.print_exc()
        print(json.dumps(r), flush=True)
        results.append(r)
    engine.unload()
    protocol.progress = orig_progress
    return results


def contact_sheet(results, path):
    from PIL import Image, ImageDraw
    ok = [r for r in results if r.get("ok")]
    if not ok:
        return
    tiles = []
    for r in ok:
        im = Image.open(r["image"]).convert("RGB")
        im.thumbnail((256, 256))
        tile = Image.new("RGB", (256, 290), "white")
        tile.paste(im, ((256 - im.width) // 2, 0))
        ImageDraw.Draw(tile).text((4, 262), "%s | %s | %ss" % (r["model"][:14], r["case"][:18], r["seconds"]), fill="black")
        tiles.append(tile)
    cols = 5
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 260, rows * 294), "white")
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 260, (i // cols) * 294))
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--max-steps", type=int, default=None)
    ap.add_argument("--sizes", nargs="*", default=None, help="e.g. 512x512 768x1024")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    results = []
    for m in a.models:
        results += run_model(m, a.out, a.quick, a.max_steps, a.sizes)
    with open(os.path.join(a.out, "results.json"), "w") as f:
        json.dump(results, f, indent=1)
    with open(os.path.join(a.out, "results.md"), "w") as f:
        f.write("| Modell | Fall | Größe | Schritte | CFG | OK | Zeit s | s/Schritt | Peak GB | Fehler |\n|---|---|---|---|---|---|---|---|---|---|\n")
        for r in results:
            f.write("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" % (
                r["model"], r["case"], r["size"], r["steps"], r["cfg"], "✓" if r.get("ok") else "✗",
                r.get("seconds", ""), r.get("s_per_step", ""), r.get("peak_gb", ""), r.get("error", "")))
    contact_sheet(results, os.path.join(a.out, "contact.png"))


if __name__ == "__main__":
    main()
