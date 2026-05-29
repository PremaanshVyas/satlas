from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_cors_allows_satlas_app():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://satlas.app',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') == 'https://satlas.app'


def test_cors_allows_vercel_origin():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://getsatlas.vercel.app',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') == 'https://getsatlas.vercel.app'


def test_cors_blocks_unknown_origin():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://evil.com',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') is None
    assert resp.status_code == 400
