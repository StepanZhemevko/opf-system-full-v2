from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.models.energy_system import EnergySystem
from backend.app.models.optimization_run import OptimizationRun
from backend.app.models.user import User
from backend.app.schemas.energy_system import OptimizationRunCreate
from backend.app.services.optimizer import run_optimization

router = APIRouter()

@router.post("/run")
def run_opf(payload: OptimizationRunCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    system = db.query(EnergySystem).filter(EnergySystem.id == payload.system_id, EnergySystem.user_id == current_user.id).first()
    if not system:
        raise HTTPException(status_code=404, detail="System not found")
    result = run_optimization(system.raw_json)
    run = OptimizationRun(user_id=current_user.id, system_id=system.id, model_type=system.raw_json["optimization_settings"]["model_type"], objective=system.raw_json["optimization_settings"]["objective"], status="completed", result_json=result)
    db.add(run)
    db.commit()
    db.refresh(run)
    return {"run_id": run.id, "result": result}

@router.get("/history")
def history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(OptimizationRun).filter(OptimizationRun.user_id == current_user.id).order_by(OptimizationRun.id.desc()).all()

@router.get("/history/{run_id}")
def history_item(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    run = db.query(OptimizationRun).filter(OptimizationRun.id == run_id, OptimizationRun.user_id == current_user.id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
