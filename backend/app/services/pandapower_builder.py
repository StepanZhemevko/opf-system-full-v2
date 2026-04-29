import pandapower as pp

def build_net_from_json(data: dict):
    net = pp.create_empty_network()
    bus_map = {}
    for bus in data.get("buses", []):
        idx = pp.create_bus(net, vn_kv=bus["vn_kv"], name=bus["name"], min_vm_pu=bus.get("min_vm_pu", 0.95), max_vm_pu=bus.get("max_vm_pu", 1.05))
        bus_map[bus["id"]] = idx

    for line in data.get("lines", []):
        pp.create_line_from_parameters(
            net,
            from_bus=bus_map[line["from_bus"]],
            to_bus=bus_map[line["to_bus"]],
            length_km=line["length_km"],
            r_ohm_per_km=line["r_ohm_per_km"],
            x_ohm_per_km=line["x_ohm_per_km"],
            c_nf_per_km=line.get("c_nf_per_km", 0.0),
            max_i_ka=line["max_i_ka"],
        )

    for load in data.get("loads", []):
        pp.create_load(net, bus=bus_map[load["bus"]], p_mw=load["p_mw"], q_mvar=load["q_mvar"])

    for gen in data.get("generators", []):
        pp.create_gen(
            net,
            bus=bus_map[gen["bus"]],
            p_mw=gen["p_mw"],
            vm_pu=gen.get("vm_pu", 1.0),
            min_p_mw=gen.get("min_p_mw", 0.0),
            max_p_mw=gen.get("max_p_mw", 1000.0),
            min_q_mvar=gen.get("min_q_mvar", -1000.0),
            max_q_mvar=gen.get("max_q_mvar", 1000.0),
            controllable=gen.get("controllable", True),
        )

    ext = data["external_grid"]
    pp.create_ext_grid(net, bus=bus_map[ext["bus"]], vm_pu=ext.get("vm_pu", 1.0))
    return net
