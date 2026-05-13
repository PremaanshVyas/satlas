import asyncio

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from overhead import satellites_overhead
from passes import predict_passes
from satellites import get_satellites, get_iss_tle
from satinfo import satellite_info

app = FastAPI(title='Aussie Sky Orbital Service')

ISS_NORAD_ID = '25544'

# TODO: tighten allow_origins to the Vercel domain before V1 production
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90, description='Decimal degrees, south negative'),
    longitude: float = Query(..., ge=-180, le=180, description='Decimal degrees, west negative'),
    hours_ahead: int = Query(24, ge=1, le=168, description='Search window in hours (max 7 days)'),
) -> dict[str, list[dict]]:
    try:
        passes = predict_passes(latitude, longitude, hours_ahead)
        return {'passes': passes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/satellites')
async def get_satellite_catalog() -> list[dict]:
    try:
        return await get_satellites()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'CelesTrak fetch failed: {e}')


@app.get('/tle/iss')
async def get_iss_tle_endpoint() -> dict[str, str]:
    try:
        return await get_iss_tle()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'ISS TLE fetch failed: {e}')


@app.get('/satellites-overhead')
async def get_satellites_overhead(
    latitude: float = Query(..., ge=-90, le=90, description='Observer latitude, decimal degrees'),
    longitude: float = Query(..., ge=-180, le=180, description='Observer longitude, decimal degrees'),
    radius_km: float = Query(2000.0, ge=0, le=20000, description='Search radius in km'),
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
        # Fetch catalog and fresh ISS TLE in parallel — both are cached so this is fast.
        # The ISS TLE uses a 5-min cache to match the globe's accuracy; the catalog uses 30 min.
        # Injecting the fresh TLE via fresh_tles ensures the chatbot and globe agree on ISS position.
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
