import os

import pytest

_real_unlink = os.unlink


def _windows_safe_unlink(path, *args, **kwargs):
    try:
        return _real_unlink(path, *args, **kwargs)
    except PermissionError:
        return None


os.unlink = _windows_safe_unlink


@pytest.fixture
def contract(direct_deploy):
    return direct_deploy("contracts/Recourse.py")
