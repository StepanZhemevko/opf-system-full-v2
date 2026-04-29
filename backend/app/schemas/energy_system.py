from typing import Literal
from pydantic import BaseModel

class EnergySystemCreate(BaseModel):
    name: str
    buses: list[dict]
    lines: list[dict] = []
    transformers: list[dict] = []
    loads: list[dict] = []
    generators: list[dict] = []
    external_grid: dict
    costs: list[dict] = []
    optimization_settings: dict

class OptimizationRunCreate(BaseModel):
    system_id: int
