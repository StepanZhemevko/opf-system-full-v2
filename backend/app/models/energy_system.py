from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.core.database import Base

class EnergySystem(Base):
    __tablename__ = "energy_systems"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    raw_json: Mapped[dict] = mapped_column(JSON)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
