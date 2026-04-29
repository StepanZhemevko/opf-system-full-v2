from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.api.auth import router as auth_router
from backend.app.api.systems import router as systems_router
from backend.app.api.optimization import router as optimization_router
from backend.app.core.config import settings
from backend.app.core.database import Base, engine
from backend.app.models.user import User
from backend.app.models.energy_system import EnergySystem
from backend.app.models.optimization_run import OptimizationRun

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OPF Web API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(systems_router, prefix="/systems", tags=["systems"])
app.include_router(optimization_router, prefix="/optimization", tags=["optimization"])

@app.get("/health")
def health():
    return {"status": "ok"}
