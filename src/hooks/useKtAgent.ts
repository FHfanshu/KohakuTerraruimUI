// ============================================
// useKtAgent - KT Agent Session Hook
// Manages KT agent WebSocket connection and message state
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '../features/attachment'
import {
  type KtAgentStatus,
  type KtRegistryEntry,
  ktExecuteCommand,
  ktGetAgent,
  ktCreateAgent,
  ktDeleteAgent,
  ktGetHistory,
  ktInterruptAgent,
  ktListConfigs,
  ktInstallPackage,
} from '../api/ktClient'
import {
  type KtUiMessage,
  type KtConnectionState,
  type KtSessionInfo,
  type KtTokenUsage,
  KtWsHandler,
} from '../api/ktEvents'

let _idCounter = 0
function newId(): string {
  return `kt_${Date.now()}_${++_idCounter}`
}

// ============================================
// Types for OpenCodeUI compatibility
// ============================================

export interface KtModelInfo {
  id: string
  providerId: string
  name: string
}

export interface KtAgentInfo {
  name: string
  tools: string[]
}

// ============================================
// Hook State
// ============================================

export interface UseKtAgentOptions {
  agentId: string | null
}

export interface UseKtAgentResult {
  // Connection
  connectionState: KtConnectionState

  // Agent info
  agentInfo: KtAgentStatus | null
  sessionInfo: KtSessionInfo
  tokenUsage: KtTokenUsage
  isStreaming: boolean

  // Messages (compatible with ChatArea)
  messages: import('../types/message').Message[]

  // Agents (for model selector compatibility)
  agents: KtAgentInfo[]
  selectedAgent: string
  setSelectedAgent: (name: string) => void

  // Send / Abort
  sendMessage: (
    text: string,
    attachments?: Attachment[],
    options?: { agent?: string; variant?: string },
  ) => Promise<boolean>
  executeCommand: (command: string) => Promise<boolean>
  abort: () => Promise<void>
  interrupt: () => Promise<void>

  // Setup
  isLoadingConfig: boolean
  configs: KtRegistryEntry[]
  startAgent: (configPath: string, pwd?: string) => Promise<string>
  stopAgent: () => Promise<void>
  installKtDefaults: () => Promise<boolean>
  refreshConfigs: () => Promise<void>
  refreshAgents: () => Promise<void>

  // Error
  error: string | null
  clearError: () => void
}

const EMPTY_SESSION_INFO: KtSessionInfo = {
  sessionId: '',
  model: '',
  agentName: '',
  maxContext: 0,
  compactThreshold: 0,
}

const EMPTY_TOKEN_USAGE: KtTokenUsage = {
  prompt: 0,
  completion: 0,
  total: 0,
  cached: 0,
  lastPrompt: 0,
}

function serializeAttachment(attachment: Attachment): string {
  if (attachment.type === 'agent' && attachment.agentName) {
    return `Requested specialist: ${attachment.agentName}`
  }
  if (attachment.type === 'file') {
    return `Attached file: ${attachment.displayName}${attachment.mime ? ` (${attachment.mime})` : ''}`
  }
  if (attachment.type === 'folder') {
    return `Referenced folder: ${attachment.relativePath || attachment.displayName}`
  }
  if (attachment.type === 'text' && attachment.content) {
    return `Attached text: ${attachment.displayName}\n${attachment.content}`
  }
  return `Attachment: ${attachment.displayName}`
}

function buildKtPrompt(text: string, attachments: Attachment[], options?: { agent?: string; variant?: string }): string {
  const sections: string[] = []

  if (options?.agent) {
    sections.push(`Requested agent mode: ${options.agent}`)
  }

  if (attachments.length > 0) {
    sections.push(['Attachments:', ...attachments.map(item => `- ${serializeAttachment(item)}`)].join('\n'))
  }

  sections.push(text)
  return sections.join('\n\n').trim()
}

function prettifyKtError(errorType: string | undefined, message: string): string {
  if (errorType === 'RateLimitError' || message.includes('usage_limit_reached')) {
    return 'Current model quota is exhausted. Wait for reset or switch to another KT model profile.'
  }
  return errorType ? `${errorType}: ${message}` : message
}

// ============================================
// Message conversion: KtUiMessage → OpenCodeUI Message
// ============================================

function ktToOcMessage(kt: KtUiMessage): import('../types/message').Message {
  const now = Date.now()

  if (kt.role === 'user') {
    const textPart = kt.parts.find(p => p.type === 'text')
    return {
      info: {
        id: kt.id,
        sessionID: 'kt',
        role: 'user' as const,
        time: { created: now },
        agent: '',
        model: { providerID: '', modelID: '' },
      },
      parts: textPart
        ? [
            {
              id: textPart.id,
              type: 'text' as const,
              text: textPart.text ?? '',
              synthetic: false,
              sessionID: 'kt',
              messageID: kt.id,
            },
          ]
        : [],
      isStreaming: false,
    }
  }

  // Assistant message
  const textParts = kt.parts
    .filter(p => p.type === 'text')
    .map(p => ({
      id: p.id,
      type: 'text' as const,
      text: p.text ?? '',
      synthetic: false,
      sessionID: 'kt',
      messageID: kt.id,
    }))

  const toolParts = kt.parts
    .filter(p => p.type === 'tool')
    .map(p => ({
      id: p.id,
      type: 'tool' as const,
      callID: p.callID ?? p.id,
      tool: p.tool ?? 'unknown',
      sessionID: 'kt',
      messageID: kt.id,
      state: p.toolState ?? {
        status: 'completed' as const,
        output: '',
        time: { start: now, end: now },
      },
    }))

  return {
    info: {
      id: kt.id,
      sessionID: 'kt',
      role: 'assistant' as const,
      time: { created: now, completed: kt.isStreaming ? undefined : now },
      parentID: '',
      modelID: '',
      providerID: '',
      mode: '',
      agent: '',
      path: { cwd: '', root: '' },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [...textParts, ...toolParts],
    isStreaming: kt.isStreaming,
  }
}

// ============================================
// Hook Implementation
// ============================================

export function useKtAgent({ agentId }: UseKtAgentOptions): UseKtAgentResult {
  // Connection
  const [connectionState, setConnectionState] = useState<KtConnectionState>('idle')

  // Agent
  const [agentInfo, setAgentInfo] = useState<KtAgentStatus | null>(null)
  const [sessionInfo, setSessionInfo] = useState<KtSessionInfo>(EMPTY_SESSION_INFO)
  const [tokenUsage, setTokenUsage] = useState<KtTokenUsage>(EMPTY_TOKEN_USAGE)
  const [error, setError] = useState<string | null>(null)

  // Messages
  const [ktMessages, setKtMessages] = useState<KtUiMessage[]>([])
  const messages = ktMessages.map(ktToOcMessage)

  // Current streaming message state (refs to avoid stale closures)
  const streamingMsgIdRef = useRef<string | null>(null)
  const activeToolCallIdRef = useRef<string | null>(null)

  // WebSocket handler
  const wsHandlerRef = useRef<KtWsHandler | null>(null)

  // Setup
  const [configs, setConfigs] = useState<KtRegistryEntry[]>([])
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)

  // Agents list (for compatibility)
  const [agents] = useState<KtAgentInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')

  const isStreaming = connectionState === 'connected' && ktMessages.some(m => m.isStreaming)

  // ============================================
  // WebSocket Event Handlers
  // ============================================

  const handleText = useCallback((content: string) => {
    setKtMessages(prev => {
      const last = prev[prev.length - 1]
      if (last && last.isStreaming && last.role === 'assistant') {
        // Append to existing streaming message
        const updated = [...prev]
        const textPartIdx = updated[prev.length - 1].parts.findIndex(p => p.type === 'text')
        if (textPartIdx >= 0) {
          updated[prev.length - 1] = {
            ...updated[prev.length - 1],
            parts: updated[prev.length - 1].parts.map((p, i) =>
              i === textPartIdx ? { ...p, text: (p.text ?? '') + content } : p,
            ),
          }
        } else {
          updated[prev.length - 1] = {
            ...updated[prev.length - 1],
            parts: [
              ...updated[prev.length - 1].parts,
              { id: newId(), type: 'text', text: content },
            ],
          }
        }
        return updated
      }
      // New streaming message
      const newMsg: KtUiMessage = {
        id: newId(),
        role: 'assistant',
        parts: [{ id: newId(), type: 'text', text: content }],
        isStreaming: true,
      }
      streamingMsgIdRef.current = newMsg.id
      return [...prev, newMsg]
    })
  }, [])

  const handleProcessingStart = useCallback(() => {
    // Processing started - streaming will begin shortly
  }, [])

  const handleProcessingEnd = useCallback(() => {
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last && last.isStreaming) {
        const updated = [...prev]
        updated[prev.length - 1] = { ...updated[prev.length - 1], isStreaming: false }
        return updated
      }
      return prev
    })
    streamingMsgIdRef.current = null
    activeToolCallIdRef.current = null
  }, [])

  const handleIdle = useCallback(() => {
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last && last.isStreaming) {
        const updated = [...prev]
        updated[prev.length - 1] = { ...updated[prev.length - 1], isStreaming: false }
        return updated
      }
      return prev
    })
    streamingMsgIdRef.current = null
    activeToolCallIdRef.current = null
  }, [])

  const handleError = useCallback((err: string) => {
    setError(err)
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last && last.isStreaming) {
        const updated = [...prev]
        updated[prev.length - 1] = { ...updated[prev.length - 1], isStreaming: false }
        return updated
      }
      return prev
    })
  }, [])

  const handleToolStart = useCallback((name: string, args: Record<string, unknown> | undefined, jobId: string | undefined) => {
    const callId = jobId ?? newId()
    activeToolCallIdRef.current = callId
    const toolPart: import('../api/ktEvents').KtMessagePart = {
      id: newId(),
      type: 'tool',
      tool: name,
      callID: callId,
      toolState: {
        status: 'running',
        input: args,
        time: { start: Date.now() },
      },
    }
    setKtMessages(prev => {
      const last = prev[prev.length - 1]
      if (last && last.isStreaming && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, parts: [...last.parts, toolPart] }]
      }
      return [...prev, {
        id: newId(),
        role: 'assistant',
        parts: [toolPart],
        isStreaming: true,
      }]
    })
  }, [])

  const handleToolDone = useCallback((name: string, result: import('../api/ktEvents').KtToolResult) => {
    const callId = activeToolCallIdRef.current
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          parts: last.parts.map(p => {
            if (p.type === 'tool' && (p.callID === callId || p.tool === name)) {
              return {
                ...p,
                toolState: {
                  status: 'completed',
                  output: result.output ?? result.result ?? result.detail ?? '',
                  input: p.toolState?.input,
                  time: { start: p.toolState?.time?.start ?? Date.now(), end: Date.now() },
                },
              }
            }
            return p
          }),
        }
      }
      return updated
    })
    activeToolCallIdRef.current = null
  }, [])

  const handleToolError = useCallback((name: string, err: string) => {
    const callId = activeToolCallIdRef.current
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last && last.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          parts: last.parts.map(p => {
            if (p.type === 'tool' && (p.callID === callId || p.tool === name)) {
              return {
                ...p,
                toolState: {
                  status: 'error',
                  error: err,
                  input: p.toolState?.input,
                  time: { start: p.toolState?.time?.start ?? Date.now(), end: Date.now() },
                },
              }
            }
            return p
          }),
        }
      }
      return updated
    })
    activeToolCallIdRef.current = null
  }, [])

  const handleSubagentStart = useCallback((_name: string, _args: Record<string, unknown> | undefined, _jobId: string | undefined) => {
    // For now, treat subagent as a tool
  }, [])

  const handleSubagentDone = useCallback((_name: string, _result: import('../api/ktEvents').KtToolResult) => {
    // For now, treat subagent as a tool
  }, [])

  const handleSubagentError = useCallback((_name: string, _err: string) => {
    // For now, treat subagent error as tool error
  }, [])

  const handleSessionInfo = useCallback((info: import('../api/ktEvents').KtSessionInfo) => {
    setSessionInfo(info)
  }, [])

  const handleTokenUsage = useCallback((prompt: number, completion: number, total: number, cached: number) => {
    setTokenUsage(prev => ({
      prompt: prev.prompt + prompt,
      completion: prev.completion + completion,
      total: prev.total + total,
      cached: prev.cached + cached,
      lastPrompt: prompt,
    }))
  }, [])

  const handleCompactStart = useCallback(() => {
    // Compact started - could show a system message
  }, [])

  const handleCompactComplete = useCallback((_summary: string | undefined, _messagesCompacted: number | undefined) => {
    // Compact completed - could show a system message
  }, [])

  const handleContextCleared = useCallback((_messagesCleared: number | undefined) => {
    // Context cleared - clear local messages
    setKtMessages([])
  }, [])

  const handleProcessingError = useCallback((errorType: string | undefined, error: string | undefined, detail: string | undefined) => {
    const message = error || detail || 'Agent processing failed'
    setError(prettifyKtError(errorType, message))
    setKtMessages(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last && last.isStreaming) {
        const updated = [...prev]
        updated[prev.length - 1] = { ...updated[prev.length - 1], isStreaming: false }
        return updated
      }
      return prev
    })
    streamingMsgIdRef.current = null
    activeToolCallIdRef.current = null
  }, [])

  // ============================================
  // WebSocket Setup / Teardown
  // ============================================

  const connectWs = useCallback(
    (agId: string) => {
      if (wsHandlerRef.current) {
        wsHandlerRef.current.disconnect()
      }

      const callbacks = {
        onText: handleText,
        onProcessingStart: handleProcessingStart,
        onProcessingEnd: handleProcessingEnd,
        onIdle: handleIdle,
        onError: handleError,
        onToolStart: handleToolStart,
        onToolDone: handleToolDone,
        onToolError: handleToolError,
        onSubagentStart: handleSubagentStart,
        onSubagentDone: handleSubagentDone,
        onSubagentError: handleSubagentError,
        onSessionInfo: handleSessionInfo,
        onTokenUsage: handleTokenUsage,
        onCompactStart: handleCompactStart,
        onCompactComplete: handleCompactComplete,
        onContextCleared: handleContextCleared,
        onProcessingError: handleProcessingError,
      }

      const handler = new KtWsHandler(agId, callbacks)
      handler.onStateChange(setConnectionState)
      handler.connect()
      wsHandlerRef.current = handler
    },
    [
      handleText,
      handleProcessingStart,
      handleProcessingEnd,
      handleIdle,
      handleError,
      handleToolStart,
      handleToolDone,
      handleToolError,
      handleSubagentStart,
      handleSubagentDone,
      handleSubagentError,
      handleSessionInfo,
      handleTokenUsage,
      handleCompactStart,
      handleCompactComplete,
      handleContextCleared,
      handleProcessingError,
    ],
  )

  // Load history for an agent
  const loadHistory = useCallback(async (agId: string) => {
    try {
      const history = await ktGetHistory(agId)
      const msgs = history.events
      const converted: KtUiMessage[] = []
      let currentText = ''
      let currentToolCallId: string | null = null
      let currentToolName: string | null = null

      for (const event of msgs) {
        switch (event.type) {
          case 'user_input': {
            if (currentToolCallId || currentText) {
              // finalize pending assistant
              if (currentToolCallId || currentToolName) {
                const parts: import('../api/ktEvents').KtMessagePart[] = []
                if (currentText) {
                  parts.push({ id: newId(), type: 'text', text: currentText })
                }
                if (currentToolCallId && currentToolName) {
                  parts.push({
                    id: newId(),
                    type: 'tool',
                    tool: currentToolName,
                    callID: currentToolCallId,
                    toolState: { status: 'completed', output: '' },
                  })
                }
                converted.push({ id: newId(), role: 'assistant', parts, isStreaming: false })
                currentText = ''
                currentToolCallId = null
                currentToolName = null
              }
            }
            converted.push({
              id: event.source ? `${event.source}_${converted.length}` : newId(),
              role: 'user',
              parts: event.content ? [{ id: newId(), type: 'text', text: event.content }] : [],
              isStreaming: false,
            })
            break
          }

          case 'text': {
            currentText += event.content ?? ''
            break
          }

          case 'tool_call': {
            if (currentText || currentToolCallId) {
              const parts: import('../api/ktEvents').KtMessagePart[] = []
              if (currentText) {
                parts.push({ id: newId(), type: 'text', text: currentText })
                currentText = ''
              }
              if (currentToolCallId && currentToolName) {
                parts.push({
                  id: newId(),
                  type: 'tool',
                  tool: currentToolName,
                  callID: currentToolCallId,
                  toolState: { status: 'completed', output: '' },
                })
              }
              converted.push({ id: newId(), role: 'assistant', parts, isStreaming: false })
              currentToolCallId = null
              currentToolName = null
            }
            currentToolCallId = event.job_id ?? newId()
            currentToolName = event.name ?? 'unknown'
            break
          }

          case 'tool_result': {
            if (currentToolCallId) {
              // Find the last assistant message with this tool
              for (let i = converted.length - 1; i >= 0; i--) {
                const msg = converted[i]
                if (msg.role === 'assistant') {
                  const toolPart = msg.parts.find(p => p.type === 'tool' && p.callID === currentToolCallId)
                  if (toolPart) {
                    toolPart.toolState = {
                      status: 'completed',
                      output: event.output ?? '',
                    }
                    break
                  }
                }
              }
            }
            break
          }

          case 'processing_end':
          case 'idle': {
            const parts: import('../api/ktEvents').KtMessagePart[] = []
            if (currentText) {
              parts.push({ id: newId(), type: 'text', text: currentText })
              currentText = ''
            }
            if (currentToolCallId && currentToolName) {
              parts.push({
                id: newId(),
                type: 'tool',
                tool: currentToolName,
                callID: currentToolCallId,
                toolState: { status: 'completed', output: '' },
              })
              currentToolCallId = null
              currentToolName = null
            }
            if (parts.length > 0) {
              converted.push({ id: newId(), role: 'assistant', parts, isStreaming: false })
            }
            break
          }
        }
      }
      setKtMessages(converted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    }
  }, [])

  // When agentId changes, connect and load
  useEffect(() => {
    if (!agentId) return

    let cancelled = false

    async function init() {
      const id = agentId!
      try {
        const info = await ktGetAgent(id)
        if (cancelled) return
        setAgentInfo(info)
        setSessionInfo({
          sessionId: info.session_id,
          model: info.model,
          agentName: info.name,
          maxContext: info.max_context,
          compactThreshold: info.compact_threshold,
        })
        setTokenUsage(EMPTY_TOKEN_USAGE)
        setKtMessages([])
        connectWs(id)
        await loadHistory(id)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to connect to agent')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      if (wsHandlerRef.current) {
        wsHandlerRef.current.disconnect()
        wsHandlerRef.current = null
      }
    }
  }, [agentId, connectWs, loadHistory])

  // ============================================
  // Send Message
  // ============================================

  const sendMessage = useCallback(
    async (
      text: string,
      attachments: Attachment[] = [],
      options?: { agent?: string; variant?: string },
    ): Promise<boolean> => {
      if (!agentId) {
        setError('No agent connected')
        return false
      }
      const ws = wsHandlerRef.current
      if (!ws || ws.getState() !== 'connected') {
        setError('WebSocket not connected')
        return false
      }

      // Add user message to UI
      const userMsg: KtUiMessage = {
        id: newId(),
        role: 'user',
        parts: [{ id: newId(), type: 'text', text }],
        isStreaming: false,
      }
      setKtMessages(prev => [...prev, userMsg])

      // Send via WebSocket
      ws.send({ type: 'input', message: buildKtPrompt(text, attachments, options) })
      return true
    },
    [agentId],
  )

  const abort = useCallback(async () => {
    if (!agentId) return
    try {
      await ktInterruptAgent(agentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abort')
    }
  }, [agentId])

  const interrupt = useCallback(async () => {
    await abort()
  }, [abort])

  const executeCommand = useCallback(
    async (command: string): Promise<boolean> => {
      if (!agentId) {
        setError('No agent connected')
        return false
      }

      const trimmed = command.trim()
      const withoutSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
      const [name, ...rest] = withoutSlash.split(/\s+/)
      if (!name) return false

      try {
        await ktExecuteCommand(agentId, name, rest.join(' '))
        await loadHistory(agentId)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to execute command')
        return false
      }
    },
    [agentId, loadHistory],
  )

  // ============================================
  // Setup: Configs & Agent Lifecycle
  // ============================================

  const refreshConfigs = useCallback(async () => {
    setIsLoadingConfig(true)
    try {
      const configs = await ktListConfigs()
      setConfigs(configs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs')
    } finally {
      setIsLoadingConfig(false)
    }
  }, [])

  const refreshAgents = useCallback(async () => {
    // This is called externally - we'll handle it at App level
  }, [])

  const startAgent = useCallback(
    async (configPath: string, pwd?: string): Promise<string> => {
      const result = await ktCreateAgent({ config_path: configPath, pwd })
      return result.agent_id
    },
    [],
  )

  const stopAgent = useCallback(async () => {
    if (!agentId) return
    try {
      await ktDeleteAgent(agentId)
      if (wsHandlerRef.current) {
        wsHandlerRef.current.disconnect()
        wsHandlerRef.current = null
      }
      setAgentInfo(null)
      setSessionInfo(EMPTY_SESSION_INFO)
      setKtMessages([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop agent')
    }
  }, [agentId])

  const installKtDefaults = useCallback(async (): Promise<boolean> => {
    try {
      await ktInstallPackage('https://github.com/Kohaku-Lab/kt-defaults.git')
      await refreshConfigs()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install kt-defaults')
      return false
    }
  }, [refreshConfigs])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    connectionState,
    agentInfo,
    sessionInfo,
    tokenUsage,
    isStreaming,
    messages,
    agents,
    selectedAgent,
    setSelectedAgent,
    sendMessage,
    executeCommand,
    abort,
    interrupt,
    isLoadingConfig,
    configs,
    startAgent,
    stopAgent,
    installKtDefaults,
    refreshConfigs,
    refreshAgents,
    error,
    clearError,
  }
}
