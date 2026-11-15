"""The local launcher finds the right interpreter and npm on Windows and POSIX."""
from pathlib import Path

import pytest

from tools import dev_local


def test_venv_python_matches_the_platform_layout():
    venv = Path('demo/solver/.venv')
    assert dev_local.venv_python(venv, windows=True) == venv / 'Scripts/python.exe'
    assert dev_local.venv_python(venv, windows=False) == venv / 'bin/python'


def test_npm_is_resolved_to_a_path_or_explained(monkeypatch):
    monkeypatch.setattr(dev_local.shutil, 'which', lambda name: None)
    with pytest.raises(RuntimeError, match='npm not found'):
        dev_local.npm()
    monkeypatch.setattr(dev_local.shutil, 'which', lambda name: r'C:\Program Files\nodejs\npm.CMD')
    assert dev_local.npm().endswith('npm.CMD')
