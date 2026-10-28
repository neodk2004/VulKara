# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Copyright (C) 2026 Oliver Schmidt
import os
import sys

# optimum-quanto compiles its kernels with ninja from the venv on first use
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


import pytest


@pytest.fixture(autouse=True)
def _install_room(monkeypatch):
    """The tests' imports do not depend on the free space of the disk they run on (test_importer checks the rule)."""
    import importer
    monkeypatch.setattr(importer, "MIN_INSTALL_FREE_GB", 0.0)
