import { EnergySystemPayload, OptimizationCase, OptimizationRunResponse } from "../api/systems";

type Props = {
  data: OptimizationRunResponse | null;
  system: EnergySystemPayload | null;
  selectedCaseKey: "baseline" | "ac" | "dc";
  onCaseChange: (value: "baseline" | "ac" | "dc") => void;
  onDownloadJson: () => void;
};

function formatNumber(value?: number, digits = 4): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-description">{description}</div>
    </div>
  );
}

function SummarySection({ title, data }: { title: string; data?: OptimizationCase }) {
  const summary = data?.summary;

  return (
    <section className="result-section">
      <h3>{title}</h3>
      <div className="metric-grid">
        <MetricCard
          title="Total Load"
          value={`${formatNumber(summary?.total_load_mw, 3)} MW`}
          description="Total active power demanded by all loads in the modeled network."
        />
        <MetricCard
          title="Total Generation"
          value={`${formatNumber(summary?.total_generation_mw, 3)} MW`}
          description="Total active power supplied by generators and external grid."
        />
        <MetricCard
          title="Estimated Losses"
          value={`${formatNumber(summary?.estimated_losses_mw, 6)} MW`}
          description="Approximate active power losses, computed as generation minus load."
        />
      </div>
    </section>
  );
}

function ComparisonSection({
  baseline,
  candidate,
  candidateLabel,
}: {
  baseline?: OptimizationCase;
  candidate?: OptimizationCase;
  candidateLabel: string;
}) {
  if (!baseline?.summary || !candidate?.summary) return null;

  const lossDelta =
    (candidate.summary.estimated_losses_mw ?? 0) - (baseline.summary.estimated_losses_mw ?? 0);
  const generationDelta =
    (candidate.summary.total_generation_mw ?? 0) - (baseline.summary.total_generation_mw ?? 0);

  return (
    <section className="result-section">
      <h3>{candidateLabel} vs Baseline</h3>
      <div className="metric-grid">
        <MetricCard
          title="Loss Change"
          value={`${formatNumber(lossDelta, 6)} MW`}
          description="Negative means the selected optimization reduced total active losses."
        />
        <MetricCard
          title="Generation Change"
          value={`${formatNumber(generationDelta, 6)} MW`}
          description="Difference in total generation between baseline and selected case."
        />
        <MetricCard
          title="Interpretation"
          value={Math.abs(lossDelta) < 1e-6 && Math.abs(generationDelta) < 1e-6 ? "No major change" : "Changed"}
          description="If there is almost no change, the optimizer likely had no cheaper or more efficient feasible alternative."
        />
      </div>
    </section>
  );
}

function ResultExplanation({
  system,
  baseline,
  selected,
  selectedLabel,
}: {
  system: EnergySystemPayload | null;
  baseline?: OptimizationCase;
  selected?: OptimizationCase;
  selectedLabel: string;
}) {
  const uploadedLoad =
    (system?.loads || []).reduce((sum, item) => sum + (item.p_mw || 0), 0) || 0;

  const baselineLoad = baseline?.summary?.total_load_mw ?? 0;
  const selectedLoss = selected?.summary?.estimated_losses_mw ?? 0;
  const baselineLoss = baseline?.summary?.estimated_losses_mw ?? 0;

  const explanations: string[] = [];

  if (system && Math.abs(uploadedLoad - baselineLoad) > 0.001) {
    explanations.push(
      `The uploaded JSON contains about ${uploadedLoad.toFixed(3)} MW of load, but the solver result shows ${baselineLoad.toFixed(3)} MW. This usually means you ran optimization on an older saved system, not the file currently displayed on the page.`,
    );
  }

  if (selected && baseline && Math.abs(selectedLoss - baselineLoss) < 1e-6) {
    explanations.push(
      `The selected ${selectedLabel} result is nearly identical to baseline. This usually means the optimizer found no better feasible dispatch under the current objective, constraints, costs, and controllable elements.`,
    );
  }

  if ((system?.generators || []).length === 0) {
    explanations.push(
      "There are no controllable generators in the uploaded system, so the external grid carries the balancing role. In that case, optimization often changes very little.",
    );
  }

  explanations.push(
    "Estimated losses are shown as generation minus load. This is a simple and understandable metric, but for detailed branch behavior you should inspect line losses and bus voltages together.",
  );

  explanations.push(
    "If you choose DC optimization, results can look simpler or less intuitive because DC OPF is a linearized approximation and does not represent reactive power behavior the same way as AC calculations.",
  );

  return (
    <section className="result-section">
      <h3>Why these results look like this</h3>
      <div className="guide-grid">
        {explanations.map((text, index) => (
          <div className="guide-card" key={`explanation-${index}`}>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BusTable({
  title,
  data,
  system,
}: {
  title: string;
  data?: OptimizationCase;
  system: EnergySystemPayload | null;
}) {
  const rows = data?.bus_results || [];
  if (!rows.length) return null;

  return (
    <section className="result-section">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th>Internal Index</th>
              <th>Bus Name</th>
              <th>Voltage (pu)</th>
              <th>Angle (deg)</th>
              <th>P (MW)</th>
              <th>Q (MVAr)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busMeta = system?.buses?.[row.index];
              return (
                <tr key={`${title}-${row.index}`}>
                  <td>{row.index}</td>
                  <td>{busMeta?.name || `Bus ${busMeta?.id ?? row.index}`}</td>
                  <td>{formatNumber(row.vm_pu, 4)}</td>
                  <td>{formatNumber(row.va_degree, 4)}</td>
                  <td>{formatNumber(row.p_mw, 4)}</td>
                  <td>{formatNumber(row.q_mvar, 4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint-text">
        Internal Index is the solver order. Bus Name comes from your uploaded JSON, so you can relate solver values back to the real network.
      </p>
    </section>
  );
}

function LineTable({
  title,
  data,
  system,
}: {
  title: string;
  data?: OptimizationCase;
  system: EnergySystemPayload | null;
}) {
  const rows = data?.line_results || [];
  if (!rows.length) return null;

  return (
    <section className="result-section">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th>Internal Index</th>
              <th>Line Name</th>
              <th>P From (MW)</th>
              <th>P To (MW)</th>
              <th>Losses (MW)</th>
              <th>Current (kA)</th>
              <th>V From (pu)</th>
              <th>V To (pu)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const lineMeta = system?.lines?.[row.index];
              return (
                <tr key={`${title}-${row.index}`}>
                  <td>{row.index}</td>
                  <td>
                    {lineMeta
                      ? `Line ${lineMeta.id} (${lineMeta.from_bus}→${lineMeta.to_bus})`
                      : `Line ${row.index}`}
                  </td>
                  <td>{formatNumber(row.p_from_mw, 4)}</td>
                  <td>{formatNumber(row.p_to_mw, 4)}</td>
                  <td>{formatNumber(row.pl_mw, 6)}</td>
                  <td>{formatNumber(row.i_ka, 4)}</td>
                  <td>{formatNumber(row.vm_from_pu, 4)}</td>
                  <td>{formatNumber(row.vm_to_pu, 4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint-text">
        Branch losses and current loading help explain where active power is dissipated and which corridors carry the most power.
      </p>
    </section>
  );
}

export default function OptimizationResultPanel({
  data,
  system,
  selectedCaseKey,
  onCaseChange,
  onDownloadJson,
}: Props) {
  if (!data) {
    return <div className="empty-state">Run optimization to see parsed results and explanations.</div>;
  }

  const baseline = data.result?.baseline;
  const ac = data.result?.ac;
  const dc = data.result?.dc;

  const selectedCase =
    selectedCaseKey === "ac" ? ac : selectedCaseKey === "dc" ? dc : baseline;

  const selectedLabel =
    selectedCaseKey === "ac" ? "AC-OPF" : selectedCaseKey === "dc" ? "DC-OPF" : "Baseline";

  return (
    <div className="result-panel">
      <div className="section-header-row">
        <div>
          <h2>Optimization Results</h2>
          <p className="section-subtitle">
            Parsed metrics, explanations, and mapped tables for the selected operating point.
          </p>
        </div>
        <button className="button button-secondary" type="button" onClick={onDownloadJson}>
          Download JSON
        </button>
      </div>

      <div className="case-switcher">
        <button
          className={selectedCaseKey === "baseline" ? "button" : "button button-secondary"}
          type="button"
          onClick={() => onCaseChange("baseline")}
        >
          Baseline
        </button>
        <button
          className={selectedCaseKey === "ac" ? "button" : "button button-secondary"}
          type="button"
          onClick={() => onCaseChange("ac")}
          disabled={!ac}
        >
          AC-OPF
        </button>
        <button
          className={selectedCaseKey === "dc" ? "button" : "button button-secondary"}
          type="button"
          onClick={() => onCaseChange("dc")}
          disabled={!dc}
        >
          DC-OPF
        </button>
      </div>

      {baseline && <SummarySection title="Baseline Summary" data={baseline} />}
      {selectedCaseKey !== "baseline" && selectedCase && (
        <SummarySection title={`${selectedLabel} Summary`} data={selectedCase} />
      )}
      {selectedCaseKey !== "baseline" && (
        <ComparisonSection baseline={baseline} candidate={selectedCase} candidateLabel={selectedLabel} />
      )}

      <ResultExplanation
        system={system}
        baseline={baseline}
        selected={selectedCase}
        selectedLabel={selectedLabel}
      />

      {baseline && <BusTable title="Baseline Bus Results" data={baseline} system={system} />}
      {selectedCaseKey !== "baseline" && selectedCase && (
        <BusTable title={`${selectedLabel} Bus Results`} data={selectedCase} system={system} />
      )}

      {baseline && <LineTable title="Baseline Line Results" data={baseline} system={system} />}
      {selectedCaseKey !== "baseline" && selectedCase && (
        <LineTable title={`${selectedLabel} Line Results`} data={selectedCase} system={system} />
      )}

      <section className="result-section">
        <h3>Parameter Guide</h3>
        <div className="guide-grid">
          <div className="guide-card"><strong>Voltage (pu)</strong><p>Bus voltage magnitude in per-unit. Close to 1.0 is usually healthy.</p></div>
          <div className="guide-card"><strong>Angle (deg)</strong><p>Bus voltage angle. It drives active power transfer across the network.</p></div>
          <div className="guide-card"><strong>P (MW)</strong><p>Active power injected or absorbed. This is the main real-power balance.</p></div>
          <div className="guide-card"><strong>Q (MVAr)</strong><p>Reactive power. Strongly related to voltage support and AC behavior.</p></div>
          <div className="guide-card"><strong>Losses (MW)</strong><p>Energy dissipated in the network. Higher current and resistance generally increase it.</p></div>
          <div className="guide-card"><strong>Current (kA)</strong><p>Branch current magnitude. Useful for understanding loading and thermal stress.</p></div>
        </div>
      </section>
    </div>
  );
}