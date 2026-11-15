import pytest

from tools.run_cloud import cloud_port


@pytest.mark.parametrize(('value', 'expected'), [
    (None, '8080'), ('8080', '8080'), ('65535', '65535'), ('00080', '80'),
])
def test_cloud_port_accepts_valid_values(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv('PORT', raising=False)
    else:
        monkeypatch.setenv('PORT', value)
    assert cloud_port() == expected


@pytest.mark.parametrize('value', ['0', '65536', '-1', '8080;echo unsafe', ' 8080', ''])
def test_cloud_port_rejects_invalid_values(monkeypatch, value):
    monkeypatch.setenv('PORT', value)
    with pytest.raises(ValueError, match='PORT'):
        cloud_port()
