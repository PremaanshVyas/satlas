from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from passes import predict_passes

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
) -> dict[str, list]:
    try:
        passes = predict_passes(latitude, longitude, hours_ahead)
        return {'passes': passes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
