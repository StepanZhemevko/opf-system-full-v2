import { ChangeEvent, useEffect, useMemo, useState } from "react";
import OptimizationResultPanel from "../components/OptimizationResultPanel";
import SystemVisualization from "../components/SystemVisualization";
import {
  EnergySystem,
  EnergySystemPayload,
  OptimizationRunResponse,
  OptimizationSettings,
  SystemCreateResponse,
  ValidationResponse,
  createSystem,
  listSystems,
  runOptimization,
  validateSystem,
} from "../api/systems";

const defaultSettings: OptimizationSettings = {
  model_type: "both",
  objective: "min_cost",
  compare_with_baseline: true,
};

type OutputState = SystemCreateResponse | ValidationResponse | OptimizationRunResponse | null;

export default function SystemsPage() {
  const [systems, setSystems] = useState<EnergySystem[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [uploadedSystem, setUploadedSystem] = useState<EnergySystemPayload | null>(null);
  const [uploadedSystemSavedId, setUploadedSystemSavedId] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [settings, setSettings] = useState<OptimizationSettings>(defaultSettings);
  const [output, setOutput] = useState<OutputState>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCaseKey, setSelectedCaseKey] = useState<"baseline" | "ac" | "dc">("baseline");

  const selectedSystem = useMemo(
    () => systems.find((system) => system.id === selectedSystemId) || null,
    [systems, selectedSystemId],
  );

  const previewJson = useMemo(() => {
    if (!uploadedSystem) return "";
    return JSON.stringify(
      {
        ...uploadedSystem,
        optimization_settings: settings,
      },
      null,
      2,
    );
  }, [uploadedSystem, settings]);

  const selectedResultCase = useMemo(() => {
    if (!output || !("run_id" in output)) return undefined;
    if (selectedCaseKey === "ac") return output.result.ac;
    if (selectedCaseKey === "dc") return output.result.dc;
    return output.result.baseline;
  }, [output, selectedCaseKey]);

  const loadSystems = async () => {
    try {
      const data = await listSystems();
      setSystems(data);

      if (!selectedSystemId && data.length > 0) {
        setSelectedSystemId(data[0].id);
      }
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Failed to load systems");
    }
  };

  useEffect(() => {
    void loadSystems();
  }, []);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as EnergySystemPayload;
      setUploadedSystem(parsed);
      setUploadedSystemSavedId(null);
      setFileName(file.name);
      setOutput(null);
      setMessage(`Loaded file: ${file.name}. Now click "Upload System" to save it before validation or optimization.`);
    } catch {
      setUploadedSystem(null);
      setUploadedSystemSavedId(null);
      setFileName("");
      setOutput(null);
      setMessage("Invalid JSON file");
    }
  };

  const updateSettings = <K extends keyof OptimizationSettings>(
    key: K,
    value: OptimizationSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const buildPayload = (): EnergySystemPayload | null => {
    if (!uploadedSystem) return null;
    return {
      ...uploadedSystem,
      optimization_settings: settings,
    };
  };

  const uploadSystem = async () => {
    const payload = buildPayload();
    if (!payload) {
      setMessage("Please upload a JSON file first");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await createSystem(payload);
      setOutput(response);
      setSelectedSystemId(response.id);
      setUploadedSystemSavedId(response.id);
      setMessage(
        `System uploaded successfully as saved system #${response.id}. Validation and optimization will now run on this system.`,
      );
      await loadSystems();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "System upload failed");
    } finally {
      setLoading(false);
    }
  };

  const ensureCorrectSystemSelected = (): boolean => {
    if (!uploadedSystem) {
      setMessage("Please upload a JSON file first");
      return false;
    }

    if (!uploadedSystemSavedId) {
      setMessage('The current file is not saved yet. Click "Upload System" first.');
      return false;
    }

    if (selectedSystemId !== uploadedSystemSavedId) {
      setMessage(
        `You uploaded "${uploadedSystem.name}", but selected saved system is #${selectedSystemId}. Please select saved system #${uploadedSystemSavedId} before validation or optimization.`,
      );
      return false;
    }

    return true;
  };

  const onValidate = async () => {
    if (!ensureCorrectSystemSelected()) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await validateSystem(selectedSystemId as number);
      setOutput(response);
      setMessage(
        response.is_valid
          ? `Validation passed for saved system #${selectedSystemId}`
          : `Validation finished with issues: ${response.errors.join(", ")}`,
      );
      await loadSystems();
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const onRun = async () => {
    if (!ensureCorrectSystemSelected()) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await runOptimization(selectedSystemId as number);
      setOutput(response);
      setSelectedCaseKey("baseline");
      setMessage(
        `Optimization completed for saved system #${selectedSystemId} (${uploadedSystem?.name || "uploaded system"}).`,
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Optimization failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadResultJson = () => {
    if (!output) return;

    const blob = new Blob([JSON.stringify(output, null, 2)], {
      type: "application/json;charset=utf-8",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "opf_result.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="systems-layout">
      <section className="card">
        <div className="card-header">
          <h2>Upload and Configure System</h2>
          <p>Upload a JSON file, save it, then validate and run OPF on that exact saved system.</p>
        </div>

        <div className="upload-box">
          <label className="upload-label">
            <span className="upload-title">Upload system JSON</span>
            <input type="file" accept=".json,application/json" onChange={onFileChange} />
          </label>

          <div className="file-meta">
            <strong>Selected file:</strong> {fileName || "No file selected"}
          </div>

          {uploadedSystem && (
            <div className="file-meta">
              <strong>Uploaded JSON name:</strong> {uploadedSystem.name}
            </div>
          )}

          <div className="file-meta">
            <strong>Saved ID for current uploaded file:</strong>{" "}
            {uploadedSystemSavedId ?? "Not uploaded yet"}
          </div>
        </div>

        <div className="settings-grid">
          <label className="form-field">
            <span>Model type</span>
            <select
              value={settings.model_type}
              onChange={(e) =>
                updateSettings("model_type", e.target.value as OptimizationSettings["model_type"])
              }
            >
              <option value="ac">AC</option>
              <option value="dc">DC</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className="form-field">
            <span>Objective</span>
            <select
              value={settings.objective}
              onChange={(e) =>
                updateSettings("objective", e.target.value as OptimizationSettings["objective"])
              }
            >
              <option value="min_cost">Minimize Cost</option>
              <option value="min_losses">Minimize Losses</option>
            </select>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={settings.compare_with_baseline}
              onChange={(e) => updateSettings("compare_with_baseline", e.target.checked)}
            />
            <span>Compare with baseline</span>
          </label>
        </div>

        <div className="inline-grid">
          <label className="form-field">
            <span>Saved systems</span>
            <select
              value={selectedSystemId ?? ""}
              onChange={(e) => setSelectedSystemId(Number(e.target.value))}
            >
              <option value="" disabled>
                Select system
              </option>
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  #{system.id} — {system.name}
                </option>
              ))}
            </select>
          </label>

          <button className="button button-secondary" onClick={() => void loadSystems()} type="button">
            Refresh
          </button>
        </div>

        {selectedSystem && (
          <div className="status-panel">
            <div><strong>Selected saved system ID:</strong> {selectedSystem.id}</div>
            <div><strong>Name:</strong> {selectedSystem.name}</div>
            <div><strong>Valid:</strong> {String(selectedSystem.is_valid)}</div>
            <div><strong>Created:</strong> {selectedSystem.created_at}</div>
          </div>
        )}

        <div className="button-row">
          <button className="button" type="button" onClick={uploadSystem} disabled={loading}>
            Upload System
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onValidate}
            disabled={!selectedSystemId || loading}
          >
            Validate
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onRun}
            disabled={!selectedSystemId || loading}
          >
            Run Optimization
          </button>
        </div>

        {message && <div className="status-box">{message}</div>}

        <div className="preview-section">
          <div className="section-header-row">
            <div>
              <h3>Final JSON Preview</h3>
              <p className="section-subtitle">
                Uploaded file merged with the selected optimization settings.
              </p>
            </div>
          </div>
          <pre className="json-box">{previewJson || "No file uploaded yet."}</pre>
        </div>
      </section>

      <OptimizationResultPanel
        data={output && "run_id" in output ? output : null}
        system={uploadedSystem}
        selectedCaseKey={selectedCaseKey}
        onCaseChange={setSelectedCaseKey}
        onDownloadJson={downloadResultJson}
      />

      <section className="card">
        <div className="card-header">
          <h2>Energy System Visualization</h2>
          <p>
            Click buses, lines, and transformers to inspect what they mean and how the selected result case behaves.
          </p>
        </div>

        <SystemVisualization system={uploadedSystem} resultCase={selectedResultCase} />
      </section>
    </div>
  );
}