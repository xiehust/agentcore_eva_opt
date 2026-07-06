"""Regression test: the deploy router must locate the real deploy_agent module.

Guards against the path-depth bug where `import deploy_agent` failed with
ModuleNotFoundError because the sample-project dir wasn't on sys.path.
"""

from __future__ import annotations

import sys

from app.routers.deploy import _ensure_lab4_on_path, _find_lab4_dir


def test_find_lab4_dir_points_at_real_deploy_agent() -> None:
    lab4 = _find_lab4_dir()
    assert (lab4 / "deploy_agent.py").is_file()
    assert lab4.name == "lab4"


def test_deploy_agent_is_importable_after_ensure_path() -> None:
    _ensure_lab4_on_path()
    assert str(_find_lab4_dir()) in sys.path
    import deploy_agent  # noqa: F401 — the import itself is the assertion

    assert hasattr(deploy_agent, "main")
