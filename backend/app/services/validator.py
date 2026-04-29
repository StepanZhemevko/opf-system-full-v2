from collections import Counter

def validate_energy_system(data: dict) -> dict:
    errors = []
    required = ["buses", "lines", "transformers", "loads", "generators", "external_grid", "costs", "optimization_settings"]
    for field in required:
        if field not in data:
            errors.append(f"Missing required field: {field}")

    bus_ids = [bus["id"] for bus in data.get("buses", []) if "id" in bus]
    duplicates = [item for item, count in Counter(bus_ids).items() if count > 1]
    if duplicates:
        errors.append(f"Duplicate bus ids: {duplicates}")

    bus_set = set(bus_ids)
    for line in data.get("lines", []):
        if line.get("from_bus") not in bus_set or line.get("to_bus") not in bus_set:
            errors.append(f"Line {line.get('id')} references missing bus")

    ext = data.get("external_grid", {})
    if ext.get("bus") not in bus_set:
        errors.append("External grid references missing bus")

    return {"is_valid": len(errors) == 0, "errors": errors}
