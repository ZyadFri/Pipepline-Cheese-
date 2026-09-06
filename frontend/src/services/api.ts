import axios from 'axios'
import { useAuthStore } from '../store/auth'
import type {
  Study, Experiment, TreatmentArm, Observation, Microorganism,
  Job, ProjectMember, NormalizationMapping, Trajectory,
  ImputationProposal, Threshold, DatasetSnapshot,
  ExportRun, AuditEvent, ValidationIssue, ProvenanceRecord,
  ExperimentMicroorganism, ProjectStats, ReviewObservation,
} from '../types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (email: string, full_name: string, password: string) =>
    api.post('/auth/register', { email, full_name, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
}

// ── Projects ──────────────────────────────────────────────────────────────

export const projectsApi = {
  list: () => api.get('/projects').then((r) => r.data),
  get: (id: number) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string; schema_fields?: unknown[] }) =>
    api.post('/projects', data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; description: string; schema_fields: unknown[] }>) =>
    api.patch(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  stats: (id: number): Promise<ProjectStats> =>
    api.get(`/projects/${id}/stats`).then((r) => r.data),
  promoteCanonical: (id: number) =>
    api.post(`/projects/${id}/promote-canonical`).then((r) => r.data),
}

// ── Papers ────────────────────────────────────────────────────────────────

export const papersApi = {
  list: (projectId: number) => api.get(`/projects/${projectId}/papers`).then((r) => r.data),
  pipelineStatus: (projectId: number) =>
    api.get(`/projects/${projectId}/papers/pipeline-status`).then((r) => r.data),
  upload: (projectId: number, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api.post(`/projects/${projectId}/papers`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  delete: (projectId: number, paperId: number) =>
    api.delete(`/projects/${projectId}/papers/${paperId}`),
}

// ── Analytics ─────────────────────────────────────────────────────────────

export const analyticsApi = {
  get: (projectId: number) => api.get(`/projects/${projectId}/analytics`).then((r) => r.data),
}

// ── Export (legacy) ───────────────────────────────────────────────────────

export const exportApi = {
  excel: (projectId: number) =>
    api.get(`/projects/${projectId}/export/excel`, { responseType: 'blob' }).then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const cd = r.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : 'export.xlsx'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    }),
}

// ── Schema ────────────────────────────────────────────────────────────────

export const schemaApi = {
  infer: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/schema/infer', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

// ── Studies ───────────────────────────────────────────────────────────────

export const studiesApi = {
  list: (projectId: number, params?: { review_status?: string; skip?: number; limit?: number }): Promise<Study[]> =>
    api.get('/studies', { params: { project_id: projectId, ...params } }).then((r) => r.data),
  get: (id: number): Promise<Study> =>
    api.get(`/studies/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Study> =>
    api.post('/studies', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>, reason?: string): Promise<Study> =>
    api.patch(`/studies/${id}`, data, { params: reason ? { reason } : undefined }).then((r) => r.data),
  approve: (id: number, reason?: string): Promise<Study> =>
    api.post(`/studies/${id}/approve`, null, { params: reason ? { reason } : undefined }).then((r) => r.data),
  reject: (id: number, reason?: string): Promise<Study> =>
    api.post(`/studies/${id}/reject`, null, { params: reason ? { reason } : undefined }).then((r) => r.data),
  delete: (id: number) => api.delete(`/studies/${id}`),
}

// ── Experiments ───────────────────────────────────────────────────────────

export const experimentsApi = {
  list: (params: { study_id?: number; project_id?: number; skip?: number; limit?: number }): Promise<Experiment[]> =>
    api.get('/experiments', { params }).then((r) => r.data),
  get: (id: number): Promise<Experiment> =>
    api.get(`/experiments/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Experiment> =>
    api.post('/experiments', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>): Promise<Experiment> =>
    api.patch(`/experiments/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/experiments/${id}`),
  addMicroorganism: (experimentId: number, data: Record<string, unknown>): Promise<ExperimentMicroorganism> =>
    api.post(`/experiments/${experimentId}/microorganisms`, data).then((r) => r.data),
  removeMicroorganism: (experimentId: number, microId: number) =>
    api.delete(`/experiments/${experimentId}/microorganisms/${microId}`),
}

// ── Treatment Arms ────────────────────────────────────────────────────────

export const armsApi = {
  list: (params: { experiment_id?: number; skip?: number; limit?: number }): Promise<TreatmentArm[]> =>
    api.get('/treatment-arms', { params }).then((r) => r.data),
  get: (id: number): Promise<TreatmentArm> =>
    api.get(`/treatment-arms/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<TreatmentArm> =>
    api.post('/treatment-arms', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>): Promise<TreatmentArm> =>
    api.patch(`/treatment-arms/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/treatment-arms/${id}`),
}

// ── Observations ──────────────────────────────────────────────────────────

export const observationsApi = {
  list: (params: {
    treatment_arm_id?: number
    experiment_id?: number
    project_id?: number
    measurement_type?: string
    review_status?: string
    include_imputed?: boolean
    skip?: number
    limit?: number
  }): Promise<Observation[]> =>
    api.get('/observations', { params }).then((r) => r.data),
  get: (id: number): Promise<Observation> =>
    api.get(`/observations/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Observation> =>
    api.post('/observations', data).then((r) => r.data),
  bulkCreate: (observations: Record<string, unknown>[]): Promise<Observation[]> =>
    api.post('/observations/bulk', { observations }).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>): Promise<Observation> =>
    api.patch(`/observations/${id}`, data).then((r) => r.data),
  approve: (id: number): Promise<Observation> =>
    api.post(`/observations/${id}/approve`).then((r) => r.data),
  delete: (id: number) => api.delete(`/observations/${id}`),
  bulkApprove: (observation_ids: number[]): Promise<Observation[]> =>
    api.post('/observations/bulk-approve', { observation_ids }).then((r) => r.data),
}

// ── Review queue (canonical, joined — backs Review & Database pages) ────────

export const reviewQueueApi = {
  list: (projectId: number, params?: {
    paper_id?: number
    review_status?: string
    skip?: number
    limit?: number
  }): Promise<ReviewObservation[]> =>
    api.get(`/projects/${projectId}/observations`, { params }).then((r) => r.data),

  // Reads ProvenanceRecord's own copy of the evidence crop path, which survives
  // re-extraction (unlike ExtEvidence, wiped and rebuilt every run) — this is the
  // stable, canonical-data-backed image URL Review.tsx should use.
  provenanceImageUrl: (projectId: number, provenanceId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/provenance/${provenanceId}/image`,

  provenanceThumbnailUrl: (projectId: number, provenanceId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/provenance/${provenanceId}/thumbnail`,
}

// ── Microorganisms ────────────────────────────────────────────────────────

export const microorganismsApi = {
  list: (params?: { project_id?: number; q?: string; organism_role?: string }): Promise<Microorganism[]> =>
    api.get('/microorganisms', { params }).then((r) => r.data),
  get: (id: number): Promise<Microorganism> =>
    api.get(`/microorganisms/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Microorganism> =>
    api.post('/microorganisms', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>): Promise<Microorganism> =>
    api.patch(`/microorganisms/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/microorganisms/${id}`),
}

// ── Jobs ──────────────────────────────────────────────────────────────────

export const jobsApi = {
  list: (params?: { project_id?: number; paper_id?: number; status?: string; job_type?: string }): Promise<Job[]> =>
    api.get('/jobs', { params }).then((r) => r.data),
  get: (id: number): Promise<Job> =>
    api.get(`/jobs/${id}`).then((r) => r.data),
  cancel: (id: number): Promise<Job> =>
    api.post(`/jobs/${id}/cancel`).then((r) => r.data),
}

// ── Team ──────────────────────────────────────────────────────────────────

export const membersApi = {
  list: (projectId: number): Promise<ProjectMember[]> =>
    api.get(`/projects/${projectId}/members`).then((r) => r.data),
  add: (projectId: number, user_email: string, role: string): Promise<ProjectMember> =>
    api.post(`/projects/${projectId}/members`, { user_email, role }).then((r) => r.data),
  updateRole: (projectId: number, userId: number, role: string): Promise<ProjectMember> =>
    api.patch(`/projects/${projectId}/members/${userId}`, { role }).then((r) => r.data),
  remove: (projectId: number, userId: number) =>
    api.delete(`/projects/${projectId}/members/${userId}`),
}

// ── Audit ─────────────────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: {
    project_id?: number
    entity_type?: string
    entity_id?: number
    action?: string
    skip?: number
    limit?: number
  }): Promise<AuditEvent[]> =>
    api.get('/audit', { params }).then((r) => r.data),
}

// ── Normalization ─────────────────────────────────────────────────────────

export const normalizationApi = {
  listMappings: (params?: { project_id?: number; mapping_type?: string }): Promise<NormalizationMapping[]> =>
    api.get('/normalization/mappings', { params }).then((r) => r.data),
  createMapping: (data: Record<string, unknown>): Promise<NormalizationMapping> =>
    api.post('/normalization/mappings', data).then((r) => r.data),
  deleteMapping: (id: number) =>
    api.delete(`/normalization/mappings/${id}`),
  apply: (projectId: number) =>
    api.post(`/normalization/apply/${projectId}`).then((r) => r.data),
}

// ── Trajectories ──────────────────────────────────────────────────────────

export const trajectoriesApi = {
  list: (params?: {
    project_id?: number
    experiment_id?: number
    treatment_arm_id?: number
    measurement_type?: string
    process_class?: string
    data_sufficient?: boolean
  }): Promise<Trajectory[]> =>
    api.get('/trajectories', { params }).then((r) => r.data),
  get: (id: number): Promise<Trajectory> =>
    api.get(`/trajectories/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Trajectory> =>
    api.post('/trajectories', data).then((r) => r.data),
  delete: (id: number) => api.delete(`/trajectories/${id}`),
}

// ── Imputations ───────────────────────────────────────────────────────────

export const imputationsApi = {
  list: (params?: {
    project_id?: number
    trajectory_id?: number
    reviewer_decision?: string
    applicability_status?: string
  }): Promise<ImputationProposal[]> =>
    api.get('/imputations', { params }).then((r) => r.data),
  get: (id: number): Promise<ImputationProposal> =>
    api.get(`/imputations/${id}`).then((r) => r.data),
  review: (id: number, decision: 'accepted' | 'rejected', note?: string): Promise<ImputationProposal> =>
    api.post(`/imputations/${id}/review`, { decision, note }).then((r) => r.data),
}

// ── Thresholds ────────────────────────────────────────────────────────────

export const thresholdsApi = {
  list: (params?: { project_id?: number; measurement_type?: string; is_active?: boolean }): Promise<Threshold[]> =>
    api.get('/thresholds', { params }).then((r) => r.data),
  get: (id: number): Promise<Threshold> =>
    api.get(`/thresholds/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<Threshold> =>
    api.post('/thresholds', data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>): Promise<Threshold> =>
    api.patch(`/thresholds/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/thresholds/${id}`),
  getCrossings: (id: number, projectId: number) =>
    api.get(`/thresholds/${id}/crossings`, { params: { project_id: projectId } }).then((r) => r.data),
}

// ── Extraction Workspace ──────────────────────────────────────────────────

export const workspaceApi = {
  start: (projectId: number, paperId: number) =>
    api.post(`/projects/${projectId}/papers/${paperId}/workspace`).then((r) => r.data),

  status: (projectId: number, paperId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}/workspace/status`).then((r) => r.data),

  listAssets: (
    projectId: number,
    paperId: number,
    params?: { asset_type?: string; classification?: string; skip?: number; limit?: number },
  ) =>
    api.get(`/projects/${projectId}/papers/${paperId}/assets`, { params }).then((r) => r.data),

  getAsset: (projectId: number, paperId: number, assetId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}/assets/${assetId}`).then((r) => r.data),

  patchAsset: (
    projectId: number,
    paperId: number,
    assetId: number,
    data: Partial<{ selected_for_llm: boolean; classification: string; user_note: string }>,
  ) =>
    api.patch(`/projects/${projectId}/papers/${paperId}/assets/${assetId}`, data).then((r) => r.data),

  listProjectAssets: (
    projectId: number,
    params?: { asset_type?: string; classification?: string; skip?: number; limit?: number },
  ) =>
    api.get(`/projects/${projectId}/assets`, { params }).then((r) => r.data),

  imageUrl: (projectId: number, paperId: number, assetId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/assets/${assetId}/image`,

  pageImageUrl: (projectId: number, paperId: number, assetId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/assets/${assetId}/page-image`,

  csvUrl: (projectId: number, paperId: number, assetId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/assets/${assetId}/csv`,

  // Serves the freshly-extracted ExtEvidence crop, valid only until the next
  // re-extraction (ExtEvidence is staging data, wiped and rebuilt each run) —
  // use inside the Extraction Workspace/Evidence Review flow, not Review.tsx.
  evidenceImageUrl: (projectId: number, paperId: number, evidenceId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/evidence/${evidenceId}/image`,

  evidenceThumbnailUrl: (projectId: number, paperId: number, evidenceId: number) =>
    `${api.defaults.baseURL}/projects/${projectId}/papers/${paperId}/evidence/${evidenceId}/thumbnail`,

  getEvidencePackages: (projectId: number, paperId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}/evidence-packages`).then((r) => r.data),

  sendToLlm: (projectId: number, paperId: number) =>
    api.post(`/projects/${projectId}/papers/${paperId}/send-to-llm`).then((r) => r.data),

  getLlmJob: (projectId: number, paperId: number, jobId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}/llm-job/${jobId}`).then((r) => r.data),
}

// ── Multi-engine extraction (LLM / Rules — ML not implemented yet) ────────

export type ExtractionEngineName = 'llm' | 'rules'

export interface EngineSummary {
  engine: ExtractionEngineName
  experiments: number
  measurements: number
  unmapped_facts: number
  last_job: { id: number; status: string; current_step: string; completed_at: string | null } | null
}

export interface UnmappedFact {
  id: number
  engine: string
  subject: string | null
  predicate: string
  value_raw: string | null
  value_normalized: number | null
  unit_raw: string | null
  unit_normalized: string | null
  category: string
  confidence: number | null
  confidence_reason: string | null
  raw_text: string | null
  page_number: number | null
  review_status: string
}

export const extractionEnginesApi = {
  run: (projectId: number, paperId: number, engine: ExtractionEngineName) =>
    api.post(`/projects/${projectId}/papers/${paperId}/extract`, null, { params: { engine } }).then((r) => r.data),

  list: (projectId: number, paperId: number): Promise<{ paper_id: number; engines: EngineSummary[] }> =>
    api.get(`/projects/${projectId}/papers/${paperId}/extractions`).then((r) => r.data),

  unmappedFacts: (projectId: number, paperId: number, engine?: ExtractionEngineName): Promise<UnmappedFact[]> =>
    api.get(`/projects/${projectId}/papers/${paperId}/unmapped-facts`, { params: engine ? { engine } : undefined }).then((r) => r.data),
}

// ── Snapshots & Exports ───────────────────────────────────────────────────

export const snapshotsApi = {
  list: (projectId?: number): Promise<DatasetSnapshot[]> =>
    api.get('/snapshots', { params: projectId ? { project_id: projectId } : undefined }).then((r) => r.data),
  get: (id: number): Promise<DatasetSnapshot> =>
    api.get(`/snapshots/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>): Promise<DatasetSnapshot> =>
    api.post('/snapshots', data).then((r) => r.data),
  requestExport: (data: {
    project_id: number
    format: string
    snapshot_id?: number
    filters?: Record<string, unknown>
  }): Promise<ExportRun> =>
    api.post('/snapshots/export', data).then((r) => r.data),
  getExportRun: (runId: number): Promise<ExportRun> =>
    api.get(`/snapshots/exports/${runId}`).then((r) => r.data),
  downloadExport: (runId: number) =>
    api.get(`/snapshots/exports/${runId}/download`, { responseType: 'blob' }).then((r) => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const cd = r.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `export_${runId}`
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    }),
}
