from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from overhead import satellites_overhead
from passes import predict_passes
from satellites import get_satellites
from satinfo import satellite_info

app = FastAPI(title='Aussie Sky Orbital Service')

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
        catalog = await get_satellites()
        result = satellite_info(catalog, query)
        if result is None:
            raise HTTPException(status_code=404, detail=f'Satellite not found: {query}')
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Satellite info query failed: {e}')
