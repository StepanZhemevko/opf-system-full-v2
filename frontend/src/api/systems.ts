import api from "./client";

export type OptimizationSettings = {
  model_type: "ac" | "dc" | "both";
  objective: "min_cost" | "min_losses";
  compare_with_baseline: boolean;
};

export type Bus = {
  id: number;
  name?: string;
  vn_kv: number;
  min_vm_pu?: number;
  max_vm_pu?: number;
};

export type Line = {
  id: number;
  from_bus: number;
  to_bus: number;
  length_km: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
  c_nf_per_km?: number;
  max_i_ka?: number;
};

export type Transformer = {
  id: number;
  hv_bus: number;
  lv_bus: number;
  sn_mva?: number;
  vn_hv_kv?: number;
  vn_lv_kv?: number;
  vk_percent?: number;
  vkr_percent?: number;
};

export type Load = {
  id: number;
  bus: number;
  p_mw: number;
  q_mvar: number;
};

export type Generator = {
  id: number;
  bus: number;
  p_mw?: number;
  vm_pu?: number;
  min_p_mw?: number;
  max_p_mw?: number;
  min_q_mvar?: number;
  max_q_mvar?: number;
  controllable?: boolean;
};

export type ExternalGrid = {
  bus: number;
  vm_pu?: number;
};

export type Cost = {
  element_type?: string;
  element_id?: number;
  cp1_eur_per_mw?: number;
  cp2_eur_per_mw2?: number;
  cp0_eur?: number;
};

export type EnergySystemPayload = {
  name: string;
  buses: Bus[];
  lines: Line[];
  transformers?: Transformer[];
  loads?: Load[];
  generators?: Generator[];
  external_grid?: ExternalGrid;
  costs?: Cost[];
  optimization_settings?: OptimizationSettings;
};

export type EnergySystem = {
  id: number;
  name: string;
  is_valid: boolean;
  created_at: string;
  raw_data?: EnergySystemPayload;
};

export type ValidationResponse = {
  is_valid: boolean;
  errors: string[];
};

export type SystemCreateResponse = {
  id: number;
  name: string;
  is_valid: boolean;
  validation_report?: ValidationResponse;
  created_at?: string;
};

export type BusResult = {
  index: number;
  vm_pu?: number;
  va_degree?: number;
  p_mw?: number;
  q_mvar?: number;
};

export type LineResult = {
  index: number;
  p_from_mw?: number;
  q_from_mvar?: number;
  p_to_mw?: number;
  q_to_mvar?: number;
  pl_mw?: number;
  ql_mvar?: number;
  i_from_ka?: number;
  i_to_ka?: number;
  i_ka?: number;
  vm_from_pu?: number;
  va_from_degree?: number;
  vm_to_pu?: number;
  va_to_degree?: number;
};

export type OptimizationCase = {
  summary?: {
    total_load_mw?: number;
    total_generation_mw?: number;
    estimated_losses_mw?: number;
  };
  bus_results?: BusResult[];
  line_results?: LineResult[];
  gen_results?: Record<string, unknown>[];
  ext_grid_results?: Record<string, unknown>[];
  error?: string;
};

export type OptimizationRunResult = {
  baseline?: OptimizationCase;
  ac?: OptimizationCase;
  dc?: OptimizationCase;
  objective?: string;
  model_type?: string;
};

export type OptimizationRunResponse = {
  run_id: number;
  result: OptimizationRunResult;
};

export type OptimizationHistoryItem = {
  id: number;
  system_id: number;
  model_type?: string;
  objective?: string;
  status: string;
  result_json?: OptimizationRunResult;
  created_at?: string;
};

export async function listSystems(): Promise<EnergySystem[]> {
  const response = await api.get("/systems");
  return response.data;
}

export async function createSystem(payload: EnergySystemPayload): Promise<SystemCreateResponse> {
  const response = await api.post("/systems", payload);
  return response.data;
}

export async function validateSystem(systemId: number): Promise<ValidationResponse> {
  const response = await api.post(`/systems/${systemId}/validate`);
  return response.data;
}

export async function runOptimization(systemId: number): Promise<OptimizationRunResponse> {
  const response = await api.post("/optimization/run", { system_id: systemId });
  return response.data;
}

export async function getOptimizationHistory(): Promise<OptimizationHistoryItem[]> {
  const response = await api.get("/optimization/history");
  return response.data;
}

export async function getOptimizationHistoryItem(runId: number): Promise<OptimizationHistoryItem> {
  const response = await api.get(`/optimization/history/${runId}`);
  return response.data;
}
