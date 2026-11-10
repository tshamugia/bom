from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dxf_fixtures import BAD_NAME, GOOD_NAME, make_bad, make_good  # noqa: E402


@pytest.fixture(scope="session")
def fixtures_dir(tmp_path_factory) -> Path:
    d = tmp_path_factory.mktemp("dxf")
    make_good(d / GOOD_NAME)
    make_bad(d / BAD_NAME)
    return d


@pytest.fixture(scope="session")
def good_dxf(fixtures_dir) -> Path:
    return fixtures_dir / GOOD_NAME


@pytest.fixture(scope="session")
def bad_dxf(fixtures_dir) -> Path:
    return fixtures_dir / BAD_NAME
