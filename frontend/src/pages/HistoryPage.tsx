import { useEffect, useState } from "react";
import {
  getOptimizationHistory,
  getOptimizationHistoryItem,
  type OptimizationHistoryItem,
} from "../api/systems";

export default function HistoryPage() {
  const [history, setHistory] = useState<OptimizationHistoryItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<OptimizationHistoryItem | null>(null);
  const [message, setMessage] = useState("");

  const loadHistory = async () => {
    try {
      const data = await getOptimizationHistory();
      setHistory(data);
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Failed to load history");
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const openRun = async (runId: number) => {
    try {
      const run = await getOptimizationHistoryItem(runId);
      setSelectedRun(run);
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Failed to load run");
    }
  };

  return (
    <div className="page-grid">
      <section className="card">
        <div className="card-header">
          <h2>Optimization history</h2>
          <p>Open previous runs and inspect saved results.</p>
        </div>

        {message && <div className="status-box">{message}</div>}

        <div className="history-list">
          {history.map((item) => (
            <button className="history-item" key={item.id} type="button" onClick={() => void openRun(item.id)}>
              <div>
                <strong>Run #{item.id}</strong>
              </div>
              <div>System #{item.system_id}</div>
              <div>
                {item.model_type} / {item.objective}
              </div>
              <div>Status: {item.status}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Selected run</h2>
          <p>Stored optimization result payload.</p>
        </div>

        <pre className="json-box">{JSON.stringify(selectedRun, null, 2)}</pre>
      </section>
    </div>
  );
}