from fastapi import FastAPI
from fastapi.testclient import TestClient

from heat_safe.application.api import serve_frontend
from heat_safe.application.api import check_hosted_config
import pytest


def test_spa_and_assets_do_not_swallow_api_or_publish_the_guide(tmp_path):
    (tmp_path / 'index.html').write_text('<html>product</html>')
    (tmp_path / 'assets').mkdir()
    (tmp_path / 'assets/app-a1.js').write_text('console.log("product")')
    app = FastAPI()
    serve_frontend(str(tmp_path), app)
    with TestClient(app) as client:
        assert client.get('/').text == '<html>product</html>'
        assert client.get('/demo-control').text == '<html>product</html>'
        assert 'no-cache' in client.get('/').headers['cache-control']
        assert 'immutable' in client.get('/assets/app-a1.js').headers['cache-control']
        for path in ('/api/missing', '/guide', '/guide/file.jpg', '/missing.js', '/openapi.json/missing.js'):
            response = client.get(path)
            assert response.status_code == 404
            assert 'product' not in response.text


def test_hosted_runtime_cannot_fall_back_to_ephemeral_sqlite(monkeypatch):
    monkeypatch.setenv('K_SERVICE', 'cloud-service')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('DATABASE_HOST', raising=False)
    with pytest.raises(RuntimeError, match='PostgreSQL'):
        check_hosted_config()
