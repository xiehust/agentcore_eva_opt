"""Locate the Lab 4 sample project (shared by the deploy router and samples).

Walks up from this file to find ``sample-open-weight-models-with-amazon-bedrock/
lab4`` (depth-independent) and can add it to sys.path so ``import deploy_agent``
resolves without copying code.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REL = Path("sample-open-weight-models-with-amazon-bedrock") / "lab4"


def find_lab4_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / _REL
        if (candidate / "deploy_agent.py").is_file():
            return candidate
    raise ModuleNotFoundError(
        f"Could not locate {_REL / 'deploy_agent.py'} above {__file__}"
    )


def ensure_lab4_on_path() -> None:
    p = str(find_lab4_dir())
    if p not in sys.path:
        sys.path.insert(0, p)
