from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.core.database import Base

class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    system_id: Mapped[int] = mapped_column(ForeignKey("energy_systems.id"), index=True)
    model_type: Mapped[str] = mapped_column(String(50))
    objective: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="completed")
    result_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
