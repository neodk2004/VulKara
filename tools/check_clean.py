# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Checks that VulKara contains nothing taken from the earlier app it replaces:

  1. no file is byte for byte one of that app's files (code, pictures, sounds),
  2. no run of four meaningful lines of code is the same as in that app (comments and spacing ignored),
  3. no names that belong to that app appear anywhere (product, folders, protocol words, links).

The earlier app is known only by fingerprints (tools/original_fingerprints.json: hashes, no code).

    python3 tools/check_clean.py          exit code 0 when clean, 1 with a list of findings
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"node_modules", "out", "dist", ".git", "__pycache__", ".pytest_cache", ".venv"}
SKIP_FILES = {"tools/original_fingerprints.json", "tools/check_clean.py", "package-lock.json"}
TEXT = re.compile(r"\.(js|ts|vue|py|json|css|scss|html|md|txt|sh|yml|yaml|plist|cfg|toml)$", re.I)
# names of the earlier app and its world; matched as words, in any case
FORBIDDEN = ["diffusionbee", "diffusion bee", "divamgupta", "tdict", "sdbk", "b2py", "py2b", "arthub",
             "db_model", "db_lora", "dbfile", r"\.diffusionbee", "app_data_2", "modifiers\\.json"]
FORBIDDEN_RE = re.compile(r"(?<![a-z0-9])(%s)(?![a-z0-9])" % "|".join(FORBIDDEN), re.I)
# the one allowed mention: the inspiration credit that names DiffusionBee next to ComfyUI (README and the site, every
# language: "Inspired by …", "Inspirada en …", "Inspirado no …"). Only the DiffusionBee name is excused, nothing else.
CREDIT_RE = re.compile(r"ComfyUI", re.I)

with open(os.path.join(ROOT, "tools", "original_fingerprints.json")) as f:
    PRINTS = json.load(f)
FILES = set(PRINTS["files"])
RUNS = set(PRINTS["runs"])
RUN = PRINTS["run"]


def normalise(line):
    line = re.sub(r"(^|\s)(//|#).*$", "", line)
    line = re.sub(r"/\*.*?\*/|<!--.*?-->", "", line)
    return re.sub(r"\s+", "", line).lower()


def project_files():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            path = os.path.join(base, name)
            rel = os.path.relpath(path, ROOT)
            if rel not in SKIP_FILES and name != ".DS_Store":
                yield rel, path


def check():
    findings = []
    for rel, path in project_files():
        with open(path, "rb") as f:
            data = f.read()
        if hashlib.sha256(data).hexdigest() in FILES:
            findings.append("%s: the same file as in the earlier app" % rel)
            continue
        if not TEXT.search(rel):
            continue
        text = data.decode("utf-8", "replace")
        for no, line in enumerate(text.splitlines(), 1):
            m = FORBIDDEN_RE.search(line)
            if m and not (m.group(0).lower().startswith("diffusion") and CREDIT_RE.search(line)):
                findings.append("%s:%d: name of the earlier app: %r" % (rel, no, m.group(0)))
        numbered = [(no, n) for no, n in ((no, normalise(l)) for no, l in enumerate(text.splitlines(), 1)) if len(n) >= 12]
        reported = -1
        for i in range(len(numbered) - RUN + 1):
            key = hashlib.sha1("\n".join(n for _, n in numbered[i:i + RUN]).encode()).hexdigest()[:16]
            if key in RUNS and numbered[i][0] > reported:
                findings.append("%s:%d-%d: lines the same as in the earlier app" % (rel, numbered[i][0], numbered[i + RUN - 1][0]))
                reported = numbered[i + RUN - 1][0]
    return findings


if __name__ == "__main__":
    found = check()
    for line in found:
        print(line)
    print("clean" if not found else "%d findings" % len(found), file=sys.stderr)
    sys.exit(1 if found else 0)
