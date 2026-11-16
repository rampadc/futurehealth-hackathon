"""The Cloud Run UI build sees every file the frontend imports from outside supervisor-ui/.

Vite resolves `import.meta.glob` at build time: a folder missing from the image is not an error,
it is an empty object. Crew photos then silently fall back to initials in production.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_SRC = ROOT / 'supervisor-ui' / 'src'


def _outside_inputs() -> set[str]:
    """Paths under ui_design_system/ or demo/ that supervisor-ui source imports or globs."""
    found = set()
    for source in UI_SRC.rglob('*.ts*'):
        for target in re.findall(r"""['"]((?:\.\./)+(?:ui_design_system|demo)/[^'"]+)['"]""", source.read_text(encoding='utf-8')):
            resolved = (source.parent / target).resolve()
            found.add(resolved.relative_to(ROOT).as_posix())
    return found


def test_every_outside_input_is_copied_into_the_ui_build():
    dockerfile = (ROOT / 'Dockerfile.cloudrun').read_text(encoding='utf-8')
    copied = re.findall(r'^COPY (?!--from)(\S+) /build/', dockerfile, flags=re.M)
    inputs = _outside_inputs()
    assert 'ui_design_system/people/*.webp' in inputs
    for path in inputs:
        assert any(path == c or path.startswith(c.rstrip('/') + '/') for c in copied), f'{path} is not copied by Dockerfile.cloudrun'


def test_crew_photos_pass_the_dockerignore():
    rules = (ROOT / '.dockerignore').read_text(encoding='utf-8').splitlines()
    assert '!ui_design_system/people/*.webp' in rules
    assert list((ROOT / 'ui_design_system' / 'people').glob('*.webp'))
