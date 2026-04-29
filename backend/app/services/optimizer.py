from __future__ import annotations

import copy
import math
from typing import Any

import pandas as pd
import pandapower as pp

from backend.app.services.pandapower_builder import build_net_from_json


def _json_safe_value(value: Any) -> Any:
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if pd.isna(value):
        return None
    return value


def _json_safe_data(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {key: _json_safe_data(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [_json_safe_data(item) for item in obj]
    return _json_safe_value(obj)


def _records(frame: pd.DataFrame | None) -> list[dict[str, Any]]:
    if frame is None:
        return []
    records = frame.reset_index().to_dict(orient="records")
    return _json_safe_data(records)


def _summary(net: Any) -> dict[str, Any]:
    total_load = float(net.load["p_mw"].sum()) if len(net.load) else 0.0

    total_gen = 0.0
    if hasattr(net, "res_gen") and len(net.res_gen):
        total_gen += float(net.res_gen["p_mw"].sum())
    if hasattr(net, "res_ext_grid") and len(net.res_ext_grid):
        total_gen += float(net.res_ext_grid["p_mw"].sum())

    return _json_safe_data(
        {
            "total_load_mw": total_load,
            "total_generation_mw": total_gen,
            "estimated_losses_mw": max(total_gen - total_load, 0.0),
        }
    )


def run_optimization(data: dict[str, Any]) -> dict[str, Any]:
    net = build_net_from_json(data)
    model_type = data["optimization_settings"]["model_type"]

    result: dict[str, Any] = {
        "baseline": None,
        "ac": None,
        "dc": None,
        "objective": data["optimization_settings"]["objective"],
        "model_type": model_type,
    }

    try:
        base = copy.deepcopy(net)
        pp.runpp(base)
        result["baseline"] = {
            "summary": _summary(base),
            "bus_results": _records(getattr(base, "res_bus", None)),
            "line_results": _records(getattr(base, "res_line", None)),
            "gen_results": _records(getattr(base, "res_gen", None)),
            "ext_grid_results": _records(getattr(base, "res_ext_grid", None)),
        }
    except Exception as exc:
        result["baseline"] = {"error": str(exc)}

    if model_type in {"ac", "both"}:
        try:
            ac = copy.deepcopy(net)
            pp.runopp(ac, calculate_voltage_angles=True)
            result["ac"] = {
                "summary": _summary(ac),
                "bus_results": _records(getattr(ac, "res_bus", None)),
                "line_results": _records(getattr(ac, "res_line", None)),
                "gen_results": _records(getattr(ac, "res_gen", None)),
                "ext_grid_results": _records(getattr(ac, "res_ext_grid", None)),
            }
        except Exception as exc:
            result["ac"] = {"error": str(exc)}

    if model_type in {"dc", "both"}:
        try:
            dc = copy.deepcopy(net)
            pp.rundcopp(dc)
            result["dc"] = {
                "summary": _summary(dc),
                "bus_results": _records(getattr(dc, "res_bus", None)),
                "line_results": _records(getattr(dc, "res_line", None)),
                "gen_results": _records(getattr(dc, "res_gen", None)),
                "ext_grid_results": _records(getattr(dc, "res_ext_grid", None)),
            }
        except Exception as exc:
            result["dc"] = {"error": str(exc)}

    return _json_safe_data(result)