# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
import os
import sys

# optimum-quanto compiles its kernels with ninja from the venv on first use
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
