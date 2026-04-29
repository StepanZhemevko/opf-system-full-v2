import { useMemo, useState } from "react";
import { BusResult, EnergySystemPayload, LineResult, OptimizationCase } from "../api/systems";

type Props = {
  system: EnergySystemPayload | null;
  resultCase?: OptimizationCase;
};

type PositionedBus = {
  id: number;
  label: string;
  x: number;
  y: number;
  result?: BusResult;
};

type SelectedItem =
  | { type: "bus"; id: number }
  | { type: "line"; id: number }
  | { type: "transformer"; id: number }
  | null;

function formatNumber(value?: number, digits = 4): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function busColor(vmPu?: number): string {
  if (typeof vmPu !== "number" || Number.isNaN(vmPu)) return "#203a75";
  if (vmPu < 0.95) return "#ff6b81";
  if (vmPu > 1.05) return "#ffb020";
  if (vmPu < 0.985) return "#5b8cff";
  return "#1fc77e";
}

function lineColor(lossMw?: number): string {
  if (typeof lossMw !== "number" || Number.isNaN(lossMw)) return "#4aa3ff";
  if (lossMw < 0.01) return "#26d0ce";
  if (lossMw < 0.1) return "#5b8cff";
  if (lossMw < 1) return "#ffb020";
  return "#ff6b81";
}

function lineWidth(currentKa?: number): number {
  if (typeof currentKa !== "number" || Number.isNaN(currentKa)) return 4;
  return Math.max(3, Math.min(10, 3 + currentKa * 10));
}

export default function SystemVisualization({ system, resultCase }: Props) {
  const [selected, setSelected] = useState<SelectedItem>(null);

  const width = 960;
  const height = 560;

  const busResultByIndex = useMemo(() => {
    const map = new Map<number, BusResult>();
    (resultCase?.bus_results || []).forEach((row) => {
      map.set(row.index, row);
    });
    return map;
  }, [resultCase]);

  const lineResultByIndex = useMemo(() => {
    const map = new Map<number, LineResult>();
    (resultCase?.line_results || []).forEach((row) => {
      map.set(row.index, row);
    });
    return map;
  }, [resultCase]);

  const positionedBuses = useMemo((): PositionedBus[] => {
    if (!system?.buses?.length) return [];
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.34;

    return system.buses.map((bus, index, arr) => {
      const angle = (2 * Math.PI * index) / arr.length - Math.PI / 2;
      return {
        id: bus.id,
        label: bus.name || `Bus ${bus.id}`,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        result: busResultByIndex.get(index),
      };
    });
  }, [system, busResultByIndex]);

  const getBus = (id: number) => positionedBuses.find((bus) => bus.id === id);

  const externalGridBus = system?.external_grid?.bus;
  const loadBusIds = new Set((system?.loads || []).map((item) => item.bus));
  const generatorBusIds = new Set((system?.generators || []).map((item) => item.bus));

  const connectedLineIds = useMemo(() => {
    if (!selected || selected.type !== "bus" || !system) return new Set<number>();
    return new Set(
      (system.lines || [])
        .filter((line) => line.from_bus === selected.id || line.to_bus === selected.id)
        .map((line) => line.id),
    );
  }, [selected, system]);

  const inspector = useMemo(() => {
    if (!selected || !system) return null;

    if (selected.type === "bus") {
      const bus = system.buses.find((item) => item.id === selected.id);
      const indexInArray = system.buses.findIndex((item) => item.id === selected.id);
      const result = resultCase?.bus_results?.find((row) => row.index === indexInArray);
      const connectedLines = (system.lines || []).filter(
        (line) => line.from_bus === selected.id || line.to_bus === selected.id,
      );
      const connectedTransformers = (system.transformers || []).filter(
        (tr) => tr.hv_bus === selected.id || tr.lv_bus === selected.id,
      );
      const loads = (system.loads || []).filter((load) => load.bus === selected.id);
      const generators = (system.generators || []).filter((gen) => gen.bus === selected.id);

      return {
        title: bus?.name || `Bus ${selected.id}`,
        lines: [
          `Bus ID: ${bus?.id ?? "—"}`,
          `Nominal voltage: ${formatNumber(bus?.vn_kv, 1)} kV`,
          `Voltage magnitude: ${formatNumber(result?.vm_pu, 4)} pu`,
          `Voltage angle: ${formatNumber(result?.va_degree, 4)} deg`,
          `Active power balance: ${formatNumber(result?.p_mw, 4)} MW`,
          `Reactive power balance: ${formatNumber(result?.q_mvar, 4)} MVAr`,
          `Connected lines: ${connectedLines.length}`,
          `Connected transformers: ${connectedTransformers.length}`,
          `Loads on bus: ${loads.length}`,
          `Generators on bus: ${generators.length}`,
          externalGridBus === selected.id ? "This is the external grid / slack bus." : "This is a normal network bus.",
        ],
      };
    }

    if (selected.type === "line") {
      const line = system.lines.find((item) => item.id === selected.id);
      const resultIndex = system.lines.findIndex((item) => item.id === selected.id);
      const result = resultCase?.line_results?.find((row) => row.index === resultIndex);

      return {
        title: `Line ${line?.id ?? "—"}`,
        lines: [
          `From bus: ${line?.from_bus ?? "—"}`,
          `To bus: ${line?.to_bus ?? "—"}`,
          `Length: ${formatNumber(line?.length_km, 2)} km`,
          `Resistance: ${formatNumber(line?.r_ohm_per_km, 4)} ohm/km`,
          `Reactance: ${formatNumber(line?.x_ohm_per_km, 4)} ohm/km`,
          `Current: ${formatNumber(result?.i_ka, 4)} kA`,
          `P from: ${formatNumber(result?.p_from_mw, 4)} MW`,
          `P to: ${formatNumber(result?.p_to_mw, 4)} MW`,
          `Losses: ${formatNumber(result?.pl_mw, 6)} MW`,
          `V from: ${formatNumber(result?.vm_from_pu, 4)} pu`,
          `V to: ${formatNumber(result?.vm_to_pu, 4)} pu`,
        ],
      };
    }

    const transformer = system.transformers?.find((item) => item.id === selected.id);
    return {
      title: `Transformer ${transformer?.id ?? "—"}`,
      lines: [
        `HV bus: ${transformer?.hv_bus ?? "—"}`,
        `LV bus: ${transformer?.lv_bus ?? "—"}`,
        `Rated power: ${formatNumber(transformer?.sn_mva, 2)} MVA`,
        `HV side voltage: ${formatNumber(transformer?.vn_hv_kv, 2)} kV`,
        `LV side voltage: ${formatNumber(transformer?.vn_lv_kv, 2)} kV`,
        `Short-circuit voltage: ${formatNumber(transformer?.vk_percent, 2)} %`,
        `Copper losses proxy (vkr): ${formatNumber(transformer?.vkr_percent, 2)} %`,
      ],
    };
  }, [selected, system, resultCase, externalGridBus]);

  if (!system || !system.buses?.length) {
    return <div className="empty-state">Upload a system JSON file to see the interactive visualization.</div>;
  }

  return (
    <div className="viz-layout">
      <div className="viz-canvas-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="energy-svg" role="img">
          <defs>
            <radialGradient id="bgGlow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="rgba(91, 140, 255, 0.22)" />
              <stop offset="100%" stopColor="rgba(91, 140, 255, 0)" />
            </radialGradient>
          </defs>

          <circle cx={width / 2} cy={height / 2} r={170} fill="url(#bgGlow)" />

          {(system.lines || []).map((line, idx) => {
            const from = getBus(line.from_bus);
            const to = getBus(line.to_bus);
            const result = lineResultByIndex.get(idx);
            if (!from || !to) return null;

            const isHighlighted =
              selected?.type === "line"
                ? selected.id === line.id
                : selected?.type === "bus"
                  ? line.from_bus === selected.id || line.to_bus === selected.id
                  : false;

            return (
              <g key={`line-${line.id}`} onClick={() => setSelected({ type: "line", id: line.id })}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={lineColor(result?.pl_mw)}
                  strokeWidth={isHighlighted ? lineWidth(result?.i_ka) + 2 : lineWidth(result?.i_ka)}
                  opacity={isHighlighted ? 1 : 0.85}
                  className="svg-clickable"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 8}
                  textAnchor="middle"
                  className="svg-label"
                >
                  Line {line.id}
                </text>
              </g>
            );
          })}

          {(system.transformers || []).map((transformer) => {
            const from = getBus(transformer.hv_bus);
            const to = getBus(transformer.lv_bus);
            if (!from || !to) return null;

            const isHighlighted =
              selected?.type === "transformer"
                ? selected.id === transformer.id
                : selected?.type === "bus"
                  ? transformer.hv_bus === selected.id || transformer.lv_bus === selected.id
                  : false;

            return (
              <g
                key={`transformer-${transformer.id}`}
                onClick={() => setSelected({ type: "transformer", id: transformer.id })}
              >
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#ffb020"
                  strokeWidth={isHighlighted ? 8 : 6}
                  strokeDasharray="12 8"
                  opacity={0.95}
                  className="svg-clickable"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 + 18}
                  textAnchor="middle"
                  className="svg-label"
                >
                  Tr {transformer.id}
                </text>
              </g>
            );
          })}

          {positionedBuses.map((bus) => {
            const isSlack = externalGridBus === bus.id;
            const hasLoad = loadBusIds.has(bus.id);
            const hasGenerator = generatorBusIds.has(bus.id);
            const isSelected = selected?.type === "bus" && selected.id === bus.id;
            const isConnected = selected?.type === "bus" && connectedLineIds.size > 0 && connectedLineIds.size >= 0;

            return (
              <g key={`bus-${bus.id}`} onClick={() => setSelected({ type: "bus", id: bus.id })}>
                <circle
                  cx={bus.x}
                  cy={bus.y}
                  r={isSlack ? 32 : isSelected ? 30 : 26}
                  fill={isSlack ? "#144e4e" : busColor(bus.result?.vm_pu)}
                  stroke={isSelected ? "#ffffff" : isConnected ? "#9cc0ff" : "#79a3ff"}
                  strokeWidth={isSelected ? 5 : 3}
                  className="svg-clickable"
                />
                {hasLoad && <circle cx={bus.x - 26} cy={bus.y - 20} r={8} className="svg-load" />}
                {hasGenerator && <circle cx={bus.x + 26} cy={bus.y - 20} r={8} className="svg-gen" />}
                <text x={bus.x} y={bus.y + 7} textAnchor="middle" className="svg-bus-id">
                  {bus.id}
                </text>
                <text x={bus.x} y={bus.y + 42} textAnchor="middle" className="svg-label">
                  {bus.label}
                </text>
                <text x={bus.x} y={bus.y + 58} textAnchor="middle" className="svg-small-label">
                  V={formatNumber(bus.result?.vm_pu, 3)} pu
                </text>
              </g>
            );
          })}
        </svg>

        <div className="legend-row">
          <div className="legend-item"><span className="legend-swatch legend-bus" />Bus</div>
          <div className="legend-item"><span className="legend-swatch legend-slack" />External Grid</div>
          <div className="legend-item"><span className="legend-swatch legend-line" />Line</div>
          <div className="legend-item"><span className="legend-swatch legend-transformer" />Transformer</div>
          <div className="legend-item"><span className="legend-swatch legend-load" />Load</div>
          <div className="legend-item"><span className="legend-swatch legend-gen" />Generator</div>
        </div>
      </div>

      <aside className="inspector-card">
        <h3>Interactive Inspector</h3>
        {!inspector ? (
          <div className="empty-state">
            Click a bus, line, or transformer to understand what it means electrically.
          </div>
        ) : (
          <>
            <div className="inspector-title">{inspector.title}</div>
            <ul className="inspector-list">
              {inspector.lines.map((line, index) => (
                <li key={`${inspector.title}-${index}`}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
