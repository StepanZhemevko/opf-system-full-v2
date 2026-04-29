from __future__ import annotations

import copy
import math
import random
from typing import Any

import pandas as pd
import pandapower as pp
from scipy.optimize import Bounds, minimize

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


def _total_cost(net: Any) -> float:
    total_cost = 0.0

    if hasattr(net, "poly_cost") and len(net.poly_cost):
        for _, row in net.poly_cost.iterrows():
            element = int(row["element"])
            et = row["et"]

            p_mw = 0.0
            if et == "gen" and hasattr(net, "res_gen") and element in net.res_gen.index:
                p_mw = float(net.res_gen.at[element, "p_mw"])
            elif et == "ext_grid" and hasattr(net, "res_ext_grid") and element in net.res_ext_grid.index:
                p_mw = float(net.res_ext_grid.at[element, "p_mw"])
            else:
                continue

            cp0 = float(row["cp0_eur"]) if pd.notna(row.get("cp0_eur")) else 0.0
            cp1 = float(row["cp1_eur_per_mw"]) if pd.notna(row.get("cp1_eur_per_mw")) else 0.0
            cp2 = float(row["cp2_eur_per_mw2"]) if pd.notna(row.get("cp2_eur_per_mw2")) else 0.0

            total_cost += cp0 + cp1 * p_mw + cp2 * (p_mw ** 2)

    return total_cost


def _summary(net: Any) -> dict[str, Any]:
    total_load = float(net.load["p_mw"].sum()) if len(net.load) else 0.0

    total_gen = 0.0
    if hasattr(net, "res_gen") and len(net.res_gen):
        total_gen += float(net.res_gen["p_mw"].sum())
    if hasattr(net, "res_ext_grid") and len(net.res_ext_grid):
        total_gen += float(net.res_ext_grid["p_mw"].sum())

    line_losses = 0.0
    if hasattr(net, "res_line") and len(net.res_line) and "pl_mw" in net.res_line:
        line_losses += float(net.res_line["pl_mw"].fillna(0.0).sum())

    trafo_losses = 0.0
    if hasattr(net, "res_trafo") and len(net.res_trafo) and "pl_mw" in net.res_trafo:
        trafo_losses += float(net.res_trafo["pl_mw"].fillna(0.0).sum())

    estimated_losses = line_losses + trafo_losses
    if estimated_losses <= 0.0:
        estimated_losses = max(total_gen - total_load, 0.0)

    estimated_cost = _total_cost(net)

    return _json_safe_data(
        {
            "total_load_mw": total_load,
            "total_generation_mw": total_gen,
            "estimated_losses_mw": estimated_losses,
            "estimated_total_cost": estimated_cost,
        }
    )


def _build_result_payload(net: Any, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {
        "summary": _summary(net),
        "bus_results": _records(getattr(net, "res_bus", None)),
        "line_results": _records(getattr(net, "res_line", None)),
        "trafo_results": _records(getattr(net, "res_trafo", None)),
        "gen_results": _records(getattr(net, "res_gen", None)),
        "ext_grid_results": _records(getattr(net, "res_ext_grid", None)),
    }
    if extra:
        payload.update(extra)
    return _json_safe_data(payload)


def _clear_costs(net: Any) -> None:
    if hasattr(net, "poly_cost") and len(net.poly_cost):
        net.poly_cost.drop(net.poly_cost.index, inplace=True)
    if hasattr(net, "pwl_cost") and len(net.pwl_cost):
        net.pwl_cost.drop(net.pwl_cost.index, inplace=True)


def _apply_min_cost_objective(net: Any, data: dict[str, Any]) -> None:
    _clear_costs(net)

    costs = data.get("costs", [])
    created_any = False

    for cost in costs:
        element_type = cost.get("element_type")
        element_id = cost.get("element_id")

        if element_type not in {"gen", "ext_grid"}:
            continue
        if element_id is None:
            continue

        pp.create_poly_cost(
            net,
            element=int(element_id),
            et=element_type,
            cp1_eur_per_mw=float(cost.get("cp1_eur_per_mw", 0.0)),
            cp0_eur=float(cost.get("cp0_eur", 0.0)),
            cp2_eur_per_mw2=float(cost.get("cp2_eur_per_mw2", 0.0)),
        )
        created_any = True

    if created_any:
        return

    if len(net.ext_grid):
        for idx in net.ext_grid.index:
            pp.create_poly_cost(
                net,
                element=int(idx),
                et="ext_grid",
                cp1_eur_per_mw=20.0,
                cp0_eur=0.0,
                cp2_eur_per_mw2=0.0,
            )

    if len(net.gen):
        for idx in net.gen.index:
            pp.create_poly_cost(
                net,
                element=int(idx),
                et="gen",
                cp1_eur_per_mw=10.0,
                cp0_eur=0.0,
                cp2_eur_per_mw2=0.0,
            )


def _run_cost_optimization(net: Any, data: dict[str, Any], mode: str) -> dict[str, Any]:
    _apply_min_cost_objective(net, data)

    if mode == "ac":
        pp.runopp(net, calculate_voltage_angles=True)
    elif mode == "dc":
        pp.rundcopp(net)
    else:
        raise ValueError(f"Unsupported cost optimization mode: {mode}")

    return _build_result_payload(
        net,
        extra={
            "optimization_backend": "pandapower_opf",
            "objective_note": "Economic cost minimization using pandapower OPF costs.",
            "mode": mode,
        },
    )


def _get_controllable_gen_indices(net: Any) -> list[int]:
    if not hasattr(net, "gen") or len(net.gen) == 0:
        return []

    if "controllable" not in net.gen.columns:
        return [int(idx) for idx in net.gen.index]

    indices: list[int] = []
    for idx, row in net.gen.iterrows():
        if pd.isna(row.get("controllable")) or bool(row.get("controllable")):
            indices.append(int(idx))
    return indices


def _get_gen_p_bounds(net: Any, gen_indices: list[int]) -> tuple[list[float], list[float], list[float]]:
    x0: list[float] = []
    lb: list[float] = []
    ub: list[float] = []

    for idx in gen_indices:
        row = net.gen.loc[idx]
        x0.append(float(row["p_mw"]))
        lb.append(
            float(row["min_p_mw"])
            if "min_p_mw" in net.gen.columns and pd.notna(row.get("min_p_mw"))
            else 0.0
        )
        ub.append(
            float(row["max_p_mw"])
            if "max_p_mw" in net.gen.columns and pd.notna(row.get("max_p_mw"))
            else float(row["p_mw"])
        )

    return x0, lb, ub


def _get_gen_vm_bounds(net: Any, gen_indices: list[int]) -> tuple[list[float], list[float], list[float]]:
    x0: list[float] = []
    lb: list[float] = []
    ub: list[float] = []

    for idx in gen_indices:
        gen_row = net.gen.loc[idx]
        bus_idx = int(gen_row["bus"])

        gen_vm = float(gen_row["vm_pu"]) if "vm_pu" in net.gen.columns and pd.notna(gen_row.get("vm_pu")) else 1.0
        bus_min_vm = (
            float(net.bus.at[bus_idx, "min_vm_pu"])
            if "min_vm_pu" in net.bus.columns and pd.notna(net.bus.at[bus_idx, "min_vm_pu"])
            else 0.95
        )
        bus_max_vm = (
            float(net.bus.at[bus_idx, "max_vm_pu"])
            if "max_vm_pu" in net.bus.columns and pd.notna(net.bus.at[bus_idx, "max_vm_pu"])
            else 1.05
        )

        x0.append(gen_vm)
        lb.append(bus_min_vm)
        ub.append(bus_max_vm)

    return x0, lb, ub


def _get_ext_grid_vm_bounds(net: Any) -> tuple[list[float], list[float], list[float]]:
    if not hasattr(net, "ext_grid") or len(net.ext_grid) == 0:
        return [], [], []

    x0: list[float] = []
    lb: list[float] = []
    ub: list[float] = []

    for idx in net.ext_grid.index:
        row = net.ext_grid.loc[idx]
        bus_idx = int(row["bus"])

        vm = float(row["vm_pu"]) if "vm_pu" in net.ext_grid.columns and pd.notna(row.get("vm_pu")) else 1.0
        min_vm = (
            float(net.bus.at[bus_idx, "min_vm_pu"])
            if "min_vm_pu" in net.bus.columns and pd.notna(net.bus.at[bus_idx, "min_vm_pu"])
            else 0.95
        )
        max_vm = (
            float(net.bus.at[bus_idx, "max_vm_pu"])
            if "max_vm_pu" in net.bus.columns and pd.notna(net.bus.at[bus_idx, "max_vm_pu"])
            else 1.05
        )

        x0.append(vm)
        lb.append(min_vm)
        ub.append(max_vm)

    return x0, lb, ub


def _set_generator_dispatch(net: Any, gen_indices: list[int], values: list[float]) -> None:
    for idx, value in zip(gen_indices, values):
        net.gen.at[idx, "p_mw"] = float(value)


def _set_generator_voltage_setpoints(net: Any, gen_indices: list[int], values: list[float]) -> None:
    if "vm_pu" not in net.gen.columns:
        net.gen["vm_pu"] = 1.0

    for idx, value in zip(gen_indices, values):
        net.gen.at[idx, "vm_pu"] = float(value)


def _set_ext_grid_voltage_setpoints(net: Any, values: list[float]) -> None:
    if not hasattr(net, "ext_grid") or len(net.ext_grid) == 0:
        return

    if "vm_pu" not in net.ext_grid.columns:
        net.ext_grid["vm_pu"] = 1.0

    for idx, value in zip(net.ext_grid.index, values):
        net.ext_grid.at[idx, "vm_pu"] = float(value)


def _constraint_penalty_ac(net: Any) -> float:
    penalty = 0.0

    if hasattr(net, "res_bus") and len(net.res_bus):
        min_vm = net.bus["min_vm_pu"] if "min_vm_pu" in net.bus.columns else pd.Series(0.95, index=net.bus.index)
        max_vm = net.bus["max_vm_pu"] if "max_vm_pu" in net.bus.columns else pd.Series(1.05, index=net.bus.index)

        undervoltage = (min_vm - net.res_bus["vm_pu"]).clip(lower=0.0)
        overvoltage = (net.res_bus["vm_pu"] - max_vm).clip(lower=0.0)
        penalty += float((undervoltage.pow(2).sum() + overvoltage.pow(2).sum()) * 1e7)

    if hasattr(net, "res_line") and len(net.res_line) and "loading_percent" in net.res_line:
        overload = (net.res_line["loading_percent"] - 100.0).clip(lower=0.0)
        penalty += float(overload.pow(2).sum() * 1e5)

    if hasattr(net, "res_trafo") and len(net.res_trafo) and "loading_percent" in net.res_trafo:
        overload = (net.res_trafo["loading_percent"] - 100.0).clip(lower=0.0)
        penalty += float(overload.pow(2).sum() * 1e5)

    return penalty


def _constraint_penalty_dc(net: Any) -> float:
    penalty = 0.0

    if hasattr(net, "res_line") and len(net.res_line) and "loading_percent" in net.res_line:
        overload = (net.res_line["loading_percent"] - 100.0).clip(lower=0.0)
        penalty += float(overload.pow(2).sum() * 1e5)

    if hasattr(net, "res_trafo") and len(net.res_trafo) and "loading_percent" in net.res_trafo:
        overload = (net.res_trafo["loading_percent"] - 100.0).clip(lower=0.0)
        penalty += float(overload.pow(2).sum() * 1e5)

    return penalty


def _ac_losses_objective(net: Any) -> float:
    line_losses = 0.0
    if hasattr(net, "res_line") and len(net.res_line) and "pl_mw" in net.res_line:
        line_losses += float(net.res_line["pl_mw"].fillna(0.0).sum())

    trafo_losses = 0.0
    if hasattr(net, "res_trafo") and len(net.res_trafo) and "pl_mw" in net.res_trafo:
        trafo_losses += float(net.res_trafo["pl_mw"].fillna(0.0).sum())

    return line_losses + trafo_losses


def _dc_losses_proxy_objective(net: Any) -> float:
    proxy = 0.0

    if hasattr(net, "res_line") and len(net.res_line):
        for idx, row in net.res_line.iterrows():
            p_flow = abs(float(row["p_from_mw"])) if "p_from_mw" in row and pd.notna(row["p_from_mw"]) else 0.0
            r_weight = 1.0
            if hasattr(net, "line") and idx in net.line.index:
                line_row = net.line.loc[idx]
                r = float(line_row["r_ohm_per_km"]) if "r_ohm_per_km" in net.line.columns else 1.0
                length = float(line_row["length_km"]) if "length_km" in net.line.columns else 1.0
                r_weight = max(r * length, 1e-6)
            proxy += p_flow * p_flow * r_weight

    if hasattr(net, "res_trafo") and len(net.res_trafo):
        for _, row in net.res_trafo.iterrows():
            if "loading_percent" in row and pd.notna(row["loading_percent"]):
                loading = float(row["loading_percent"])
                proxy += 0.01 * loading * loading

    return proxy


def _split_ac_candidate(
    candidate: list[float],
    gen_count: int,
    ext_grid_count: int,
) -> tuple[list[float], list[float], list[float]]:
    p_values = [float(value) for value in candidate[:gen_count]]
    vm_values = [float(value) for value in candidate[gen_count : gen_count * 2]]
    ext_vm_values = [float(value) for value in candidate[gen_count * 2 : gen_count * 2 + ext_grid_count]]
    return p_values, vm_values, ext_vm_values


def _evaluate_min_losses_ac(
    candidate: list[float],
    base_net: Any,
    gen_indices: list[int],
    ext_grid_count: int,
) -> float:
    net = copy.deepcopy(base_net)
    gen_count = len(gen_indices)
    p_values, vm_values, ext_vm_values = _split_ac_candidate(candidate, gen_count, ext_grid_count)

    _set_generator_dispatch(net, gen_indices, p_values)
    _set_generator_voltage_setpoints(net, gen_indices, vm_values)
    _set_ext_grid_voltage_setpoints(net, ext_vm_values)

    try:
        pp.runpp(net, calculate_voltage_angles=True)
    except Exception:
        return 1e12

    losses = _ac_losses_objective(net)
    penalty = _constraint_penalty_ac(net)
    return float(losses + penalty)


def _evaluate_min_losses_dc(candidate: list[float], base_net: Any, gen_indices: list[int]) -> float:
    net = copy.deepcopy(base_net)
    _set_generator_dispatch(net, gen_indices, candidate)

    try:
        pp.rundcpp(net)
    except Exception:
        return 1e12

    losses_proxy = _dc_losses_proxy_objective(net)
    penalty = _constraint_penalty_dc(net)
    return float(losses_proxy + penalty)


def _pure_ac_losses_for_dispatch(
    base_net: Any,
    gen_indices: list[int],
    ext_grid_count: int,
    candidate: list[float],
) -> float:
    net = copy.deepcopy(base_net)
    gen_count = len(gen_indices)
    p_values, vm_values, ext_vm_values = _split_ac_candidate(candidate, gen_count, ext_grid_count)

    _set_generator_dispatch(net, gen_indices, p_values)
    _set_generator_voltage_setpoints(net, gen_indices, vm_values)
    _set_ext_grid_voltage_setpoints(net, ext_vm_values)

    pp.runpp(net, calculate_voltage_angles=True)
    return float(_ac_losses_objective(net))


def _pure_dc_losses_proxy_for_dispatch(base_net: Any, gen_indices: list[int], candidate: list[float]) -> float:
    net = copy.deepcopy(base_net)
    _set_generator_dispatch(net, gen_indices, candidate)
    pp.rundcpp(net)
    return float(_dc_losses_proxy_objective(net))


def _random_candidate(lb: list[float], ub: list[float]) -> list[float]:
    return [random.uniform(low, high) for low, high in zip(lb, ub)]


def _run_single_loss_minimization(
    net: Any,
    mode: str,
    gen_indices: list[int],
    ext_grid_count: int,
    x0: list[float],
    lb: list[float],
    ub: list[float],
) -> tuple[list[float], float, float, bool, int, str, int]:
    bounds = Bounds(lb, ub)

    if mode == "ac":
        objective_fn = lambda x: _evaluate_min_losses_ac(list(x), net, gen_indices, ext_grid_count)
        pure_metric_fn = lambda x: _pure_ac_losses_for_dispatch(net, gen_indices, ext_grid_count, list(x))
    elif mode == "dc":
        objective_fn = lambda x: _evaluate_min_losses_dc(list(x), net, gen_indices)
        pure_metric_fn = lambda x: _pure_dc_losses_proxy_for_dispatch(net, gen_indices, list(x))
    else:
        raise ValueError(f"Unsupported loss optimization mode: {mode}")

    optimization = minimize(
        objective_fn,
        x0=x0,
        method="SLSQP",
        bounds=bounds,
        options={"maxiter": 220, "ftol": 1e-9, "disp": False},
    )

    candidate_x = list(optimization.x) if hasattr(optimization, "x") else x0

    try:
        pure_metric = pure_metric_fn(candidate_x)
    except Exception:
        pure_metric = float("inf")

    try:
        search_objective = objective_fn(candidate_x)
    except Exception:
        search_objective = float("inf")

    return (
        candidate_x,
        float(search_objective),
        float(pure_metric),
        bool(getattr(optimization, "success", False)),
        int(getattr(optimization, "status", -1)),
        str(getattr(optimization, "message", "")),
        int(getattr(optimization, "nit", 0)),
    )


def _run_loss_optimization(net: Any, mode: str) -> dict[str, Any]:
    gen_indices = _get_controllable_gen_indices(net)

    if not gen_indices:
        raise ValueError("No controllable generators found for backend loss minimization.")

    if mode == "ac":
        p_x0, p_lb, p_ub = _get_gen_p_bounds(net, gen_indices)
        vm_x0, vm_lb, vm_ub = _get_gen_vm_bounds(net, gen_indices)
        ext_vm_x0, ext_vm_lb, ext_vm_ub = _get_ext_grid_vm_bounds(net)

        ext_grid_count = len(ext_vm_x0)
        x0 = p_x0 + vm_x0 + ext_vm_x0
        lb = p_lb + vm_lb + ext_vm_lb
        ub = p_ub + vm_ub + ext_vm_ub

        pure_metric_fn = lambda x: _pure_ac_losses_for_dispatch(net, gen_indices, ext_grid_count, list(x))
    elif mode == "dc":
        x0, lb, ub = _get_gen_p_bounds(net, gen_indices)
        ext_grid_count = 0
        pure_metric_fn = lambda x: _pure_dc_losses_proxy_for_dispatch(net, gen_indices, list(x))
    else:
        raise ValueError(f"Unsupported loss optimization mode: {mode}")

    try:
        baseline_pure_loss_metric = pure_metric_fn(x0)
    except Exception:
        baseline_pure_loss_metric = float("inf")

    best_x = x0
    best_pure_loss_metric = baseline_pure_loss_metric
    best_success = False
    best_status = -1
    best_message = "Baseline kept"
    best_iterations = 0

    start_points = [x0]
    for _ in range(10):
        start_points.append(_random_candidate(lb, ub))

    for start in start_points:
        (
            candidate_x,
            _search_objective,
            pure_loss_metric,
            success,
            status,
            message,
            iterations,
        ) = _run_single_loss_minimization(net, mode, gen_indices, ext_grid_count, start, lb, ub)

        if success and math.isfinite(pure_loss_metric) and pure_loss_metric < best_pure_loss_metric:
            best_x = candidate_x
            best_pure_loss_metric = pure_loss_metric
            best_success = success
            best_status = status
            best_message = message
            best_iterations = iterations

    improvement_tolerance = 1e-6
    use_baseline = not (best_success and best_pure_loss_metric < baseline_pure_loss_metric - improvement_tolerance)

    final_x = x0 if use_baseline else best_x
    final_net = copy.deepcopy(net)

    if mode == "ac":
        gen_count = len(gen_indices)
        final_p, final_vm, final_ext_vm = _split_ac_candidate(final_x, gen_count, ext_grid_count)
        _set_generator_dispatch(final_net, gen_indices, final_p)
        _set_generator_voltage_setpoints(final_net, gen_indices, final_vm)
        _set_ext_grid_voltage_setpoints(final_net, final_ext_vm)
        pp.runpp(final_net, calculate_voltage_angles=True)

        dispatch_payload = [
            {"gen_index": idx, "p_mw": float(p_value), "vm_pu": float(vm_value)}
            for idx, p_value, vm_value in zip(gen_indices, final_p, final_vm)
        ]
        ext_grid_payload = [
            {"ext_grid_index": int(idx), "vm_pu": float(value)}
            for idx, value in zip(final_net.ext_grid.index, final_ext_vm)
        ]
    else:
        _set_generator_dispatch(final_net, gen_indices, final_x)
        pp.rundcpp(final_net)

        dispatch_payload = [
            {"gen_index": idx, "p_mw": float(value)}
            for idx, value in zip(gen_indices, final_x)
        ]
        ext_grid_payload = []

    return _build_result_payload(
        final_net,
        extra={
            "optimization_backend": "custom_backend_multistart_minimize",
            "objective_note": (
                "Backend-only loss minimization with multi-start search. "
                "AC mode optimizes generator active power, generator voltage setpoints, "
                "and external-grid voltage setpoints. Baseline is kept if no strictly better "
                "loss solution is found."
            ),
            "mode": mode,
            "solver_success": bool(best_success),
            "solver_status": int(best_status),
            "solver_message": str(best_message),
            "solver_iterations": int(best_iterations),
            "baseline_pure_loss_metric": float(baseline_pure_loss_metric),
            "best_pure_loss_metric": float(best_pure_loss_metric),
            "used_baseline_instead_of_optimized": bool(use_baseline),
            "loss_improvement_mw": float(max(baseline_pure_loss_metric - best_pure_loss_metric, 0.0))
            if math.isfinite(best_pure_loss_metric) and math.isfinite(baseline_pure_loss_metric)
            else None,
            "optimized_generator_dispatch": dispatch_payload,
            "optimized_ext_grid_controls": ext_grid_payload,
        },
    )


def _run_baseline(net: Any, data: dict[str, Any]) -> dict[str, Any]:
    base = copy.deepcopy(net)

    objective = data["optimization_settings"]["objective"]
    if objective == "min_cost":
        _apply_min_cost_objective(base, data)

    pp.runpp(base, calculate_voltage_angles=True)

    return _build_result_payload(
        base,
        extra={
            "optimization_backend": "pandapower_powerflow",
            "objective_note": "Baseline load-flow result before any optimization.",
            "mode": "ac",
        },
    )


def run_optimization(data: dict[str, Any]) -> dict[str, Any]:
    net = build_net_from_json(data)
    settings = data["optimization_settings"]
    model_type = settings["model_type"]
    objective = settings["objective"]

    result: dict[str, Any] = {
        "baseline": None,
        "ac": None,
        "dc": None,
        "objective": objective,
        "model_type": model_type,
    }

    try:
        result["baseline"] = _run_baseline(net, data)
    except Exception as exc:
        result["baseline"] = {"error": str(exc)}

    if model_type in {"ac", "both"}:
        try:
            ac_net = copy.deepcopy(net)
            if objective == "min_cost":
                result["ac"] = _run_cost_optimization(ac_net, data, mode="ac")
            elif objective == "min_losses":
                result["ac"] = _run_loss_optimization(ac_net, mode="ac")
            else:
                raise ValueError(f"Unsupported objective: {objective}")
        except Exception as exc:
            result["ac"] = {"error": str(exc)}

    if model_type in {"dc", "both"}:
        try:
            dc_net = copy.deepcopy(net)
            if objective == "min_cost":
                result["dc"] = _run_cost_optimization(dc_net, data, mode="dc")
            elif objective == "min_losses":
                result["dc"] = _run_loss_optimization(dc_net, mode="dc")
            else:
                raise ValueError(f"Unsupported objective: {objective}")
        except Exception as exc:
            result["dc"] = {"error": str(exc)}

    return _json_safe_data(result)