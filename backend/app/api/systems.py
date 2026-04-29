from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.models.energy_system import EnergySystem
from backend.app.models.user import User
from backend.app.schemas.energy_system import EnergySystemCreate
from backend.app.services.validator import validate_energy_system


router = APIRouter()

@router.post("")
def create_system(payload: EnergySystemCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = validate_energy_system(payload.model_dump())
    system = EnergySystem(user_id=current_user.id, name=payload.name, raw_json=payload.model_dump(), is_valid=report["is_valid"], validation_report=report)
    db.add(system)
    db.commit()
    db.refresh(system)
    return {"id": system.id, "name": system.name, "is_valid": system.is_valid, "validation_report": system.validation_report}

@router.get("")
def list_systems(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(EnergySystem).filter(EnergySystem.user_id == current_user.id).order_by(EnergySystem.id.desc()).all()

@router.get("/{system_id}")
def get_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    system = db.query(EnergySystem).filter(EnergySystem.id == system_id, EnergySystem.user_id == current_user.id).first()
    if not system:
        raise HTTPException(status_code=404, detail="System not found")
    return system

@router.post("/{system_id}/validate")
def validate_system(system_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    system = db.query(EnergySystem).filter(EnergySystem.id == system_id, EnergySystem.user_id == current_user.id).first()
    if not system:
        raise HTTPException(status_code=404, detail="System not found")
    report = validate_energy_system(system.raw_json)
    system.is_valid = report["is_valid"]
    system.validation_report = report
    db.commit()
    return report
