// ============================================
// KT WebSocket Event Handler
// Maps KT WebSocket events to KT session state
// ============================================

import type { KtHistoryEvent } from './ktClient'

export type KtConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

export interface KtSessionInfo {
  sessionId: string
  model: string
  agentName: string
  maxContext: number
  compactThreshold: number
}

export interface KtTokenUsage {
  prompt: number
  completion: number
  total: number
  cached: number
  lastPrompt: number
}

export type KtMessageRole = 'user' | 'assistant' | 'system'

export interface KtToolResult {
  output?: string
  result?: string
  detail?: string
}

export interface KtMessagePart {
  id: string
  type: 'text' | 'tool' | 'reasoning'
  // text
  text?: string
  // tool
  tool?: string
  callID?: string
  toolState?: {
    status: 'pending' | 'running' | 'completed' | 'error'
    input?: Record<string, unknown>
    output?: string
    error?: string
    time?: { start: number; end?: number }
  }
}

export interface KtUiMessage {
  id: string
  role: KtMessageRole
  parts: KtMessagePart[]
  isStreaming: boolean
  sender?: string
  metadata?: Record<string, unknown>
}

interface KtWsTextEvent {
  type: 'text'
  content: string
  source: string
}

interface KtWsProcessingStartEvent {
  type: 'processing_start'
  source: string
}

interface KtWsProcessingEndEvent {
  type: 'processing_end'
  source: string
}

interface KtWsIdleEvent {
  type: 'idle'
  source: string
}

interface KtWsErrorEvent {
  type: 'error'
  content: string
  source: string
}

interface KtWsActivityEvent {
  type: 'activity'
  activity_type: string
  name: string
  detail?: string
  source: string
  args?: Record<string, unknown>
  job_id?: string
  result?: string
  output?: string
  error?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cached_tokens?: number
  messages_compacted?: number
  messages_cleared?: number
}

interface KtWsSessionInfoEvent {
  type: 'activity'
  activity_type: 'session_info'
  source: string
  model?: string
  agent_name?: string
  session_id?: string
  max_context?: number
  compact_threshold?: number
}

interface KtWsChannelEvent {
  type: 'channel_message'
  source: string
  channel: string
  sender?: string
  content?: string
  message_id?: string
  timestamp?: string
  ts?: number
}

type KtWsEvent =
  | KtWsTextEvent
  | KtWsProcessingStartEvent
  | KtWsProcessingEndEvent
  | KtWsIdleEvent
  | KtWsErrorEvent
  | KtWsActivityEvent
  | KtWsSessionInfoEvent
  | KtWsChannelEvent

export interface KtEventCallbacks {
  onText: (content: string) => void
  onProcessingStart: () => void
  onProcessingEnd: () => void
  onIdle: () => void
  onError: (error: string) => void
  onToolStart: (name: string, args: Record<string, unknown> | undefined, jobId: string | undefined) => void
  onToolDone: (name: string, result: KtToolResult) => void
  onToolError: (name: string, error: string) => void
  onSubagentStart: (name: string, args: Record<string, unknown> | undefined, jobId: string | undefined) => void
  onSubagentDone: (name: string, result: KtToolResult) => void
  onSubagentError: (name: string, error: string) => void
  onSessionInfo: (info: KtSessionInfo) => void
  onTokenUsage: (prompt: number, completion: number, total: number, cached: number) => void
  onCompactStart: () => void
  onCompactComplete: (summary: string | undefined, messagesCompacted: number | undefined) => void
  onContextCleared: (messagesCleared: number | undefined) => void
}

let _idCounter = 0
function newId(): string {
  return `kt_${Date.now()}_${++_idCounter}`
}

export function buildKtWsUrl(agentId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/creatures/${agentId}`
}

export class KtWsHandler {
  private ws: WebSocket | null = null
  private callbacks: KtEventCallbacks
  private agentId: string
  private state: KtConnectionState = 'idle'
  private listeners = new Set<(state: KtConnectionState) => void>()

  constructor(agentId: string, callbacks: KtEventCallbacks) {
    this.agentId = agentId
    this.callbacks = callbacks
  }

  connect(): void {
    if (this.ws) {
      this.ws.close()
    }
    this.setState('connecting')
    const url = buildKtWsUrl(this.agentId)
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.setState('connected')
    }

    this.ws.onmessage = (evt) => {
      let data: KtWsEvent
      try {
        data = JSON.parse(evt.data as string) as KtWsEvent
      } catch {
        return
      }
      this.handleEvent(data)
    }

    this.ws.onerror = () => {
      this.setState('error')
    }

    this.ws.onclose = () => {
      this.setState('closed')
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  getState(): KtConnectionState {
    return this.state
  }

  onStateChange(fn: (state: KtConnectionState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private setState(state: KtConnectionState): void {
    this.state = state
    this.listeners.forEach(fn => fn(state))
  }

  private handleEvent(data: KtWsEvent): void {
    switch (data.type) {
      case 'text':
        this.callbacks.onText(String(data.content ?? ''))
        break

      case 'processing_start':
        this.callbacks.onProcessingStart()
        break

      case 'processing_end':
        this.callbacks.onProcessingEnd()
        break

      case 'idle':
        this.callbacks.onIdle()
        break

      case 'error':
        this.callbacks.onError(String(data.content ?? 'Unknown error'))
        break

      case 'activity': {
        const act = data as KtWsActivityEvent | KtWsSessionInfoEvent
        if (act.activity_type === 'session_info') {
          const si = act as KtWsSessionInfoEvent
          this.callbacks.onSessionInfo({
            sessionId: String(si.session_id ?? ''),
            model: String(si.model ?? ''),
            agentName: String(si.agent_name ?? ''),
            maxContext: Number(si.max_context ?? 0),
            compactThreshold: Number(si.compact_threshold ?? 0),
          })
          return
        }
        if (act.activity_type === 'token_usage') {
          this.callbacks.onTokenUsage(
            Number(act.prompt_tokens ?? 0),
            Number(act.completion_tokens ?? 0),
            Number(act.total_tokens ?? 0),
            Number(act.cached_tokens ?? 0),
          )
          return
        }
        if (act.activity_type === 'tool_start') {
          this.callbacks.onToolStart(act.name, act.args, act.job_id)
          return
        }
        if (act.activity_type === 'tool_done') {
          this.callbacks.onToolDone(act.name, { output: act.output, result: act.result, detail: act.detail })
          return
        }
        if (act.activity_type === 'tool_error') {
          this.callbacks.onToolError(act.name, String(act.error ?? act.detail ?? 'Unknown error'))
          return
        }
        if (act.activity_type === 'subagent_start') {
          this.callbacks.onSubagentStart(act.name, act.args, act.job_id)
          return
        }
        if (act.activity_type === 'subagent_done') {
          this.callbacks.onSubagentDone(act.name, { output: act.output, result: act.result, detail: act.detail })
          return
        }
        if (act.activity_type === 'subagent_error') {
          this.callbacks.onSubagentError(act.name, String(act.error ?? act.detail ?? 'Unknown error'))
          return
        }
        if (act.activity_type === 'compact_start') {
          this.callbacks.onCompactStart()
          return
        }
        if (act.activity_type === 'compact_complete') {
          this.callbacks.onCompactComplete(act.detail, act.messages_compacted)
          return
        }
        if (act.activity_type === 'context_cleared') {
          this.callbacks.onContextCleared(act.messages_cleared)
          return
        }
        break
      }

      default:
        break
    }
  }
}

// Convert KT history events to UI messages
export function historyEventsToMessages(events: KtHistoryEvent[]): KtUiMessage[] {
  const messages: KtUiMessage[] = []
  let currentAssistantMsg: KtUiMessage | null = null
  let currentAssistantText = ''
  const toolResults = new Map<string, string>()

  for (const event of events) {
    switch (event.type) {
      case 'user_input': {
        if (currentAssistantMsg) {
          this_finalizeAssistant(currentAssistantMsg, currentAssistantText)
          messages.push(currentAssistantMsg)
          currentAssistantMsg = null
          currentAssistantText = ''
        }
        messages.push({
          id: newId(),
          role: 'user',
          parts: event.content ? [{ id: newId(), type: 'text', text: event.content }] : [],
          isStreaming: false,
        })
        break
      }

      case 'text': {
        if (!currentAssistantMsg) {
          currentAssistantMsg = {
            id: newId(),
            role: 'assistant',
            parts: [],
            isStreaming: false,
          }
          currentAssistantText = ''
        }
        currentAssistantText += event.content ?? ''
        break
      }

      case 'tool_call': {
        if (!currentAssistantMsg) {
          currentAssistantMsg = {
            id: newId(),
            role: 'assistant',
            parts: [],
            isStreaming: false,
          }
          currentAssistantText = ''
        }
        currentAssistantMsg.parts.push({
          id: newId(),
          type: 'tool',
          tool: event.name,
          callID: event.job_id ?? newId(),
          toolState: {
            status: 'running',
            input: event.args,
            time: { start: event.ts },
          },
        })
        break
      }

      case 'tool_result': {
        toolResults.set(event.job_id ?? '', event.output ?? '')
        break
      }

      case 'processing_end':
      case 'idle': {
        if (currentAssistantMsg) {
          if (currentAssistantText) {
            currentAssistantMsg.parts.push({
              id: newId(),
              type: 'text',
              text: currentAssistantText,
            })
          }
          // Attach tool results to tool parts
          for (const part of currentAssistantMsg.parts) {
            if (part.type === 'tool' && part.callID) {
              const result = toolResults.get(part.callID)
              if (result !== undefined) {
                part.toolState = {
                  status: 'completed',
                  output: result,
                  input: part.toolState?.input,
                  time: part.toolState?.time,
                }
              }
            }
          }
          messages.push(currentAssistantMsg)
          currentAssistantMsg = null
          currentAssistantText = ''
        }
        break
      }
    }
  }

  if (currentAssistantMsg) {
    if (currentAssistantText) {
      currentAssistantMsg.parts.push({
        id: newId(),
        type: 'text',
        text: currentAssistantText,
      })
    }
    messages.push(currentAssistantMsg)
  }

  return messages
}

// Helper to finalize an assistant message (called internally)
function this_finalizeAssistant(msg: KtUiMessage, text: string): void {
  if (text) {
    msg.parts.push({
      id: newId(),
      type: 'text',
      text,
    })
  }
}
