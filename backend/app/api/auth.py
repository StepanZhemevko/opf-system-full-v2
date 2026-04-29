from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.core.security import create_access_token, hash_password, verify_password
from backend.app.models.user import User
from backend.app.schemas.auth import TokenResponse, UserCreate

router = APIRouter()


@router.post("/register")
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter((User.username == payload.username) | (User.email == payload.email)).first():
        raise HTTPException(status_code=400, detail="User already exists")
    user = User(email=payload.email, username=payload.username, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "username": user.username}


@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.username))


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email, "username": current_user.username}