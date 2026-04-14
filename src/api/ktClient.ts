// ============================================
// KT REST API Client
// Direct bindings to kt web (port 8001) REST endpoints
// ============================================

const KT_API_BASE = '/api'

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${KT_API_BASE}${path}`, {
    credentials: 'same-origin',
  })
  return parseJson<T>(response)
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${KT_API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  return parseJson<T>(response)
}

async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${KT_API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with ${response.status}`)
  }
}

// ============================================
// Types
// ============================================

export interface KtAgentStatus {
  agent_id: string
  name: string
  model: string
  provider: string
  session_id: string
  max_context: number
  compact_threshold: number
  running: boolean
  tools: string[]
  subagents: string[]
  pwd: string
}

export interface KtAgentCreate {
  config_path: string
  llm?: string
  pwd?: string
}

export interface KtRegistryEntry {
  name: string
  type: 'creature' | 'terrarium'
  description: string
  model: string
  tools: string[]
  path: string
  source: string
}

export interface KtModelEntry {
  name: string
  model: string
  provider: string
  login_provider: string
  available: boolean
  source: string
  max_context: number
  max_output: number
  temperature: number | null
  reasoning_effort: string
  extra_body: Record<string, unknown>
  base_url: string
  is_default: boolean
}

export interface KtSessionListItem {
  name: string
  filename: string
  config_type: string
  config_path: string
  terrarium_name: string
  agents: string[]
  status: string
  created_at: string
  last_active: string
  preview: string
  pwd: string
}

export interface KtSessionListResponse {
  sessions: KtSessionListItem[]
  total: number
  offset: number
  limit: number
}

export interface KtProfileRequest {
  name: string
  model: string
  provider: string
  base_url?: string
  api_key_env?: string
  max_context?: number
  max_output?: number
  temperature?: number | null
  reasoning_effort?: string
  extra_body?: Record<string, unknown>
}

export interface KtDefaultModelResponse {
  default_model: string
}

export interface KtMcpServer {
  name: string
  transport: string
  command: string
  args: string[]
  env: Record<string, string>
  url: string
}

export interface KtMcpResponse {
  servers: KtMcpServer[]
}

export interface KtHistoryResponse {
  agent_id: string
  events: KtHistoryEvent[]
}

export interface KtHistoryEvent {
  type: string
  ts: number
  content?: string
  source?: string
  name?: string
  detail?: string
  activity_type?: string
  args?: Record<string, unknown>
  job_id?: string
  result?: string
  output?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cached_tokens?: number
  session_id?: string
  model?: string
  agent_name?: string
  max_context?: number
  compact_threshold?: number
  summary?: string
  messages_compacted?: number
  messages_cleared?: number
  error?: string
  error_type?: string
  channel?: string
  sender?: string
  message_id?: string
}

// ============================================
// Registry
// ============================================

export async function ktListConfigs(): Promise<KtRegistryEntry[]> {
  return apiGet<KtRegistryEntry[]>('/registry')
}

export async function ktListModels(): Promise<KtModelEntry[]> {
  return apiGet<KtModelEntry[]>('/settings/models')
}

export async function ktListSessions(params?: { limit?: number; offset?: number; search?: string }): Promise<KtSessionListResponse> {
  const search = new URLSearchParams()
  if (params?.limit != null) search.set('limit', String(params.limit))
  if (params?.offset != null) search.set('offset', String(params.offset))
  if (params?.search) search.set('search', params.search)
  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  return apiGet<KtSessionListResponse>(`/sessions${suffix}`)
}

export async function ktResumeSession(sessionName: string): Promise<{ instance_id: string; type: string; session_name: string }> {
  return apiPost(`/sessions/${encodeURIComponent(sessionName)}/resume`, undefined)
}

export async function ktSaveProfile(profile: KtProfileRequest): Promise<{ status: string; name: string }> {
  return apiPost('/settings/profiles', profile)
}

export async function ktGetDefaultModel(): Promise<KtDefaultModelResponse> {
  return apiGet('/settings/default-model')
}

export async function ktSetDefaultModel(name: string): Promise<KtDefaultModelResponse & { status: string }> {
  return apiPost('/settings/default-model', { name })
}

export async function ktListMcpServers(): Promise<KtMcpResponse> {
  return apiGet('/settings/mcp')
}

export async function ktSaveMcpServer(server: KtMcpServer): Promise<{ status: string; name: string }> {
  return apiPost('/settings/mcp', server)
}

export async function ktRemoveMcpServer(name: string): Promise<void> {
  await apiDelete(`/settings/mcp/${encodeURIComponent(name)}`)
}

// ============================================
// Agents
// ============================================

export async function ktListAgents(): Promise<KtAgentStatus[]> {
  return apiGet<KtAgentStatus[]>('/agents')
}

export async function ktGetAgent(agentId: string): Promise<KtAgentStatus> {
  return apiGet<KtAgentStatus>(`/agents/${agentId}`)
}

export async function ktCreateAgent(req: KtAgentCreate): Promise<{ agent_id: string; status: string }> {
  return apiPost('/agents', req)
}

export async function ktDeleteAgent(agentId: string): Promise<void> {
  await apiDelete(`/agents/${agentId}`)
}

export async function ktInterruptAgent(agentId: string): Promise<{ status: string }> {
  return apiPost(`/agents/${agentId}/interrupt`, undefined)
}

export async function ktGetHistory(agentId: string): Promise<KtHistoryResponse> {
  return apiGet<KtHistoryResponse>(`/agents/${agentId}/history`)
}

export async function ktSwitchModel(agentId: string, model: string): Promise<{ status: string; model: string }> {
  return apiPost(`/agents/${agentId}/model`, { model })
}

// ============================================
// Slash Commands
// ============================================

export async function ktExecuteCommand(
  agentId: string,
  command: string,
  args: string,
): Promise<unknown> {
  return apiPost(`/agents/${agentId}/command`, { command, args })
}

// ============================================
// Package Installation
// ============================================

export async function ktInstallPackage(url: string, name?: string): Promise<{ status: string; name: string }> {
  return apiPost('/registry/install', { url, name })
}
