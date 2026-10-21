# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
"""Content filter for generated pictures and videos, and their marking as AI generated.

Model licenses require it: Krea 2 (section 4.2) and the FLUX non-commercial licenses (2.e) ask for content
filter measures, Ideogram 4 for "appropriate safety measures, including content filters"; FLUX, Ideogram and
Krea ask for a disclosure that outputs are AI generated where the law requires one (EU AI Act, article 50).

Every result is checked before the app shows it:
    - nudity: Falconsai/nsfw_image_detection (ViT, Apache-2.0)
    - faces from the DWPose detector (preprocess.py), each estimated with dima806/facial_age_image_detection
      (ViT, Apache-2.0)
    blocked: nudity together with a face that is likely a minor (always), any nudity in safe mode.
Videos are checked on frames spread over the clip. Blocked results are deleted, and so are results the
filter could not check (fail-closed). Pictures that pass get machine-readable AI metadata (IPTC digital
source type "trainedAlgorithmicMedia" in XMP, plus a comment).

    python main.py content_check            serve: one JSON request per line on stdin, one answer per line
    python main.py content_check <file> …   check files (prints the answers)

Request {"id", "path", "safe_mode", "model"}; answer {"id", "ok": true} or {"id", "ok": false, "reason"}.
"""
import json
import os
import shutil
import sys
import time

NSFW_MODEL = "Falconsai/nsfw_image_detection"
AGE_MODEL = "dima806/facial_age_image_detection"
# the commits the filter was tested with, and the checksums of their weights (pinned.py)
PINNED = {
    NSFW_MODEL: ("96cb0d0342c7afb80cab76ecc58b265fa44da256",
                 "97b2ce64ec146884b37f98ee7944ca4891aa72f6827dc0cb10684a1cbecd5830"),
    AGE_MODEL: ("ad35933da48272de7295530766f3d6c56702eba8",
                "4ce822b91f33fbf51b75c71d447d6fa3eace831fb056c511b719e79bd117f097"),
}
NSFW_LIMIT = 0.6     # probability of "nsfw" from which a picture counts as nudity
MINOR_LIMIT = 0.5    # probability of an age below 18 from which a face counts as a minor
VIDEO_FRAMES = 6
# age classes of the age model and their share below 18 (16-20: about half)
MINOR_SHARE = {"01": 1, "02": 1, "03": 1, "04": 1, "05": 1, "06-07": 1, "08-09": 1, "10-12": 1, "13-15": 1,
               "16-20": 0.4}
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTS = (".mp4", ".webm", ".mov")
XMP = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" '
       'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">'
       '<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
       '</Iptc4xmpExt:DigitalSourceType><xmp:CreatorTool>VulKara</xmp:CreatorTool>'
       '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">%s</rdf:li></rdf:Alt></dc:description>'
       '</rdf:Description></rdf:RDF></x:xmpmeta>')


def ai_notice(model):
    return "AI generated with VulKara" + (" (model: %s)" % model if model else "")


class Checker:
    def __init__(self):
        self._nsfw = None
        self._age = None

    def _load(self, repo, classes):
        import torch
        from transformers import AutoModelForImageClassification
        import pinned
        import preprocess
        revision, digest = PINNED[repo]
        local = pinned.fetch(repo, revision, {"config.json": None, "preprocessor_config.json": None, "model.safetensors": digest},
                             str(preprocess.root() / "content_filter" / repo.replace("/", "--")))
        with open(os.path.join(local, "preprocessor_config.json")) as f:
            cfg = json.load(f)
        model = AutoModelForImageClassification.from_pretrained(local).eval()
        missing = set(classes) - set(model.config.id2label.values())
        if missing:  # other classes than expected would let every picture pass
            raise RuntimeError("%s has no class %s" % (repo, ", ".join(sorted(missing))))
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        return cfg, model.to(device), device

    @staticmethod
    def _pixels(images, cfg):
        """The ViT image processor's resize / rescale / normalize, without torchvision."""
        import numpy as np
        import torch
        from PIL import Image
        size = cfg.get("size") or {}
        w, h = size.get("width", size.get("shortest_edge", 224)), size.get("height", size.get("shortest_edge", 224))
        mean = np.array(cfg.get("image_mean", [0.5, 0.5, 0.5]), np.float32)
        std = np.array(cfg.get("image_std", [0.5, 0.5, 0.5]), np.float32)
        arr = [((np.asarray(im.convert("RGB").resize((w, h), Image.BILINEAR), np.float32)
                 * cfg.get("rescale_factor", 1 / 255)) - mean) / std for im in images]
        return torch.from_numpy(np.stack(arr).transpose(0, 3, 1, 2).copy())

    def _probs(self, which, images):
        import torch
        if which == "nsfw":
            self._nsfw = self._nsfw or self._load(NSFW_MODEL, ["nsfw"])
            cfg, model, device = self._nsfw
        else:
            self._age = self._age or self._load(AGE_MODEL, MINOR_SHARE)
            cfg, model, device = self._age
        with torch.no_grad():
            pixels = self._pixels(images, cfg).to(device)
            p = model(pixel_values=pixels).logits.softmax(-1).float().cpu().numpy()
        labels = model.config.id2label
        return [{labels[i]: float(row[i]) for i in range(len(row))} for row in p]

    def nsfw(self, img):
        return self._probs("nsfw", [img])[0]["nsfw"]

    def faces(self, img):
        """Face crops of every person DWPose finds (face points, else nose / eyes / ears)."""
        import preprocess
        out = []
        for person in preprocess.detect_pose(img)["people"]:
            pts = [p for p in (person.get("face") or []) if p]
            if len(pts) < 8:
                pts = [person["body"][i] for i in (0, 14, 15, 16, 17) if person["body"][i]]
                pad = 1.2
            else:
                pad = 0.35
            if len(pts) < 2:
                continue
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            size = max(max(xs) - min(xs), max(ys) - min(ys), 16)
            cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
            half = size * (0.5 + pad)
            box = (int(max(0, cx - half)), int(max(0, cy - half)), int(min(img.width, cx + half)),
                   int(min(img.height, cy + half)))
            if box[2] - box[0] >= 12 and box[3] - box[1] >= 12:
                out.append(img.crop(box))
        return out

    def minor(self, img):
        """Highest probability over all faces that the person is under 18 (0 without faces)."""
        faces = self.faces(img)
        if not faces:
            return 0.0
        return max(sum(p * MINOR_SHARE.get(k, 0) for k, p in row.items()) for row in self._probs("age", faces))

    def check_picture(self, img, safe_mode):
        nsfw = self.nsfw(img)
        if nsfw < NSFW_LIMIT:
            return None
        if safe_mode:
            return "Nudity is not shown in safe mode (Settings → Content)."
        minor = self.minor(img)
        if minor >= MINOR_LIMIT:
            return ("The picture shows nudity (%.0f %%) and a person who is likely a minor (%.0f %%). Sexual content "
                    "involving minors is prohibited by every model license and by law." % (nsfw * 100, minor * 100))
        return None

    def check(self, path, safe_mode=False):
        from PIL import Image
        ext = os.path.splitext(path)[1].lower()
        if ext in VIDEO_EXTS:
            for frame in video_frames(path):
                reason = self.check_picture(frame, safe_mode)
                if reason:
                    return reason
            return None
        with Image.open(path) as im:
            return self.check_picture(im.convert("RGB"), safe_mode)


def video_frames(path, n=VIDEO_FRAMES):
    import cv2
    from PIL import Image
    cap = cv2.VideoCapture(path)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    frames = []
    for k in range(n):
        cap.set(cv2.CAP_PROP_POS_FRAMES, min(count - 1, int(k * count / n)))
        ok, f = cap.read()
        if ok:
            frames.append(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)))
    cap.release()
    if not frames:
        raise RuntimeError("could not read the video")
    return frames


def mark(path, model=""):
    """AI marking in the file's metadata (pictures; videos are marked by the engine that writes them)."""
    from PIL import Image, PngImagePlugin
    ext = os.path.splitext(path)[1].lower()
    if ext not in IMAGE_EXTS:
        return
    notice = ai_notice(model)
    xmp = XMP % notice.replace("&", "&amp;").replace("<", "&lt;")
    with Image.open(path) as im:
        im.load()
        tmp = path + ".marking" + ext
        if ext == ".png":
            info = PngImagePlugin.PngInfo()
            for k, v in (im.text or {}).items():
                if k not in ("Comment", "Software", "XML:com.adobe.xmp"):
                    info.add_text(k, v)
            info.add_text("Software", "VulKara")
            info.add_text("Comment", notice)
            info.add_itxt("XML:com.adobe.xmp", xmp)
            im.save(tmp, format="PNG", pnginfo=info)
        else:
            im.save(tmp, format="JPEG" if ext in (".jpg", ".jpeg") else "WEBP", quality=95, xmp=xmp.encode(),
                    exif=im.getexif())
    os.replace(tmp, path)


# The EU's icons for labelling AI-generated content (digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-
# ai-generated-content; free for everyone to use, no attribution required), 512 px high in eu_ai_label/:
# generated / modified / ai (the round basic icon), black / white, each also 50 % transparent ("_50").
LABEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eu_ai_label")
LABEL_KINDS = ("generated", "modified", "ai")
# the icon's height as a share of the picture's shorter side
LABEL_SIZES = {"small": 0.035, "medium": 0.05, "large": 0.07}
# next to a labelled result, the picture without the label: taken instead when the result is used as an input again,
# so a picture made from a picture carries one label, not the old one showing through (src/main/unlabelled.ts)
UNLABELLED = ".unlabelled"


def _label_tone(img, box):
    """black on a light corner, white on a dark one: the mean brightness where the icon goes."""
    corner = img.crop(box).convert("L")
    mean = sum(i * n for i, n in enumerate(corner.histogram())) / max(1, corner.width * corner.height)
    return "black" if mean >= 140 else "white"


def label(path, size="medium", kind="generated", tone="auto", subtle=False):
    """Puts the EU icon for AI content into the lower right corner: "AI GENERATED", "AI MODIFIED" or the round "AI",
    black or white (by the corner's brightness unless a tone is given), optionally 50 % transparent. Pictures only;
    the file's metadata stays."""
    from PIL import Image, PngImagePlugin
    ext = os.path.splitext(path)[1].lower()
    if ext not in IMAGE_EXTS:
        return
    kind = kind if kind in LABEL_KINDS else "generated"
    clean = os.path.join(os.path.dirname(path), UNLABELLED)
    os.makedirs(clean, exist_ok=True)
    shutil.copy2(path, os.path.join(clean, os.path.basename(path)))
    with Image.open(path) as im:
        im.load()
        text = dict(im.text) if ext == ".png" else {}
        mode = im.mode
        img = im.convert("RGBA")
    w, h = img.size
    ih = max(16, round(min(w, h) * LABEL_SIZES.get(size, LABEL_SIZES["medium"])))
    with Image.open(os.path.join(LABEL_DIR, "%s_black.png" % kind)) as probe:
        iw = round(probe.width * ih / probe.height)
    pad = round(ih * 0.6)
    x, y = w - pad - iw, h - pad - ih
    if tone not in ("black", "white"):
        tone = _label_tone(img, (x, y, x + iw, y + ih))
    name = "%s_%s%s.png" % (kind, tone, "_50" if subtle else "")
    with Image.open(os.path.join(LABEL_DIR, name)) as icon:
        icon = icon.convert("RGBA").resize((iw, ih), Image.LANCZOS)
    img.alpha_composite(icon, (x, y))
    out = img if mode == "RGBA" else img.convert("RGB")
    tmp = path + ".label" + ext
    if ext == ".png":
        info = PngImagePlugin.PngInfo()
        for k, v in text.items():
            info.add_text(k, v)
        out.save(tmp, format="PNG", pnginfo=info)
    else:
        out.save(tmp, format="JPEG" if ext in (".jpg", ".jpeg") else "WEBP", quality=95)
    os.replace(tmp, path)


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def _is_result(path):
    import paths
    folder = os.path.realpath(paths.images_dir())
    return os.path.realpath(path).startswith(folder + os.sep)


def handle(checker, req):
    """Fail-closed: a result that could not be checked is not shown, and it is deleted like a blocked one
    when it is a fresh result in the images folder (nobody has seen it)."""
    path = req.get("path") or ""
    # a model's preview picture: removed when it does not pass, but never marked (it is not a result of this app)
    preview = bool(req.get("preview")) and os.path.basename(path) == "preview.jpg"
    # keep: a picture of the user's (a training picture), only judged: never removed, never marked
    keep = bool(req.get("keep"))
    own = not keep and (preview or _is_result(path))
    try:
        reason = checker.check(path, bool(req.get("safe_mode")))
    except Exception as e:
        if own:
            _remove(path)
        return {"ok": False, "reason": "The content filter could not check the result (%s), so it is not shown."
                % str(e)[:200]}
    if reason:
        if own:
            _remove(path)
        return {"ok": False, "reason": reason, "blocked": True}
    if preview or keep:
        return {"ok": True}
    if req.get("label"):
        opts = req["label"] if isinstance(req["label"], dict) else {}
        try:
            label(path, opts.get("size", "medium"), opts.get("kind", "generated"), opts.get("tone", "auto"),
                  bool(opts.get("subtle")))
        except Exception as e:
            print("[content_check] could not label %s: %s" % (path, e), file=sys.stderr, flush=True)
    clean = os.path.join(os.path.dirname(path), UNLABELLED, os.path.basename(path))
    for p in [path] + ([clean] if req.get("label") and os.path.isfile(clean) else []):
        try:
            mark(p, req.get("model") or "")
        except Exception as e:
            print("[content_check] could not mark %s: %s" % (p, e), file=sys.stderr, flush=True)
    return {"ok": True}


def main(argv):
    checker = Checker()
    if argv:
        for path in argv:
            t0 = time.time()
            ans = handle(checker, {"path": path})
            print(json.dumps(dict(ans, path=path, seconds=round(time.time() - t0, 2))), flush=True)
        return 0
    print("ready", flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        if not isinstance(req, dict):
            continue
        ans = handle(checker, req)
        print(json.dumps(dict(ans, id=req.get("id"))), flush=True)
    return 0
