"""Where the Heat-Safe data lives: data/heat_safe/ in the project folder.

It has its own subfolder because data/ is shared with teammates' files (different ERA5 layout, and their
services/verify_data.py regenerates data/manifest.json). Every module takes its data paths from here.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "heat_safe"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
MANIFEST = DATA / "manifest.json"
