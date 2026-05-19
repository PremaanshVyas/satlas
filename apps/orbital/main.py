import asyncio
import os

import sentry_sdk
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import run_migrations
from overhead import satellites_overhead
from passes import predict_passes
from satellites import get_satellites, get_iss_tle, refresh_loop
from satinfo import satellite_info

_sentry_dsn = os.environ.get('SENTRY_DSN', '')
if _sentry_dsn and _sentry_dsn.startswith('https://'):
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.2)

app = FastAPI(title='Satlas Orbital Service')

ISS_NORAD_ID = '25544'
_CATEGORY_KEYS = ('STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER')


def _classify_satellite(name: str) -> str:
    """Mirror of Globe.ts classifySatellite() — must stay in sync."""
    n = name.upper()
    if n.startswith('STARLINK'):
        return 'STARLINK'
    if n.startswith('GPS') or 'NAVSTAR' in n or n.startswith('BIIF') or n.startswith('BIII'):
        return 'GPS'
    if n.startswith('IRIDIUM'):
        return 'IRIDIUM'
    if ' DEB' in n or n.endswith(' DEB') or 'DEBRIS' in n or 'R/B' in n or 'ROCKET BODY' in n:
        return 'DEBRIS'
    return 'OTHER'


_ALLOWED_ORIGINS = [
    'https://getsatlas.vercel.app',
    'http://localhost:5173',
    'http://localhost:4173',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.on_event('startup')
async def startup_event() -> None:
    run_migrations()
    asyncio.create_task(refresh_loop())


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    hours_ahead: int = Query(24, ge=1, le=168),
) -> dict[str, list[dict]]:
    try:
        return {'passes': predict_passes(latitude, longitude, hours_ahead)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/satellite-categories')
async def get_satellite_categories() -> dict[str, int]:
    try:
        catalog = await get_satellites()
        counts: dict[str, int] = {k: 0 for k in _CATEGORY_KEYS}
        for sat in catalog:
            if sat.get('norad_id') == ISS_NORAD_ID:
                continue
            counts[_classify_satellite(sat.get('name', ''))] += 1
        return counts
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Category count failed: {e}')


@app.get('/tle/iss')
async def get_iss_tle_endpoint() -> dict[str, str]:
    try:
        return await get_iss_tle()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'ISS TLE fetch failed: {e}')


@app.get('/satellites-overhead')
async def get_satellites_overhead(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(2000.0, ge=0, le=20000),
) -> list[dict]:
    try:
        catalog = await get_satellites()
        return satellites_overhead(catalog, latitude, longitude, radius_km)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Overhead query failed: {e}')


@app.get('/satellite-info')
async def get_satellite_info(
    query: str = Query(..., description='Satellite name (substring) or NORAD catalog ID'),
) -> dict:
    try:
        catalog_result, iss_tle_result = await asyncio.gather(
            get_satellites(), get_iss_tle(), return_exceptions=True
        )
        if isinstance(catalog_result, Exception):
            raise catalog_result
        fresh_tles = {}
        if not isinstance(iss_tle_result, Exception):
            fresh_tles[ISS_NORAD_ID] = iss_tle_result
        result = satellite_info(catalog_result, query, fresh_tles if fresh_tles else None)
        if result is None:
            raise HTTPException(status_code=404, detail=f'Satellite not found: {query}')
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Satellite info query failed: {e}')
