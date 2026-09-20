"""Temporary runner: regenerate the stored market snapshot package-relative.

`py -m market.snapshot` needs the dashboard directory on the import path, and
the working directory cannot be changed here, so this adds it and calls main().
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from market import snapshot  # noqa: E402

snapshot.main()
