import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  CogIcon,
  CloseIcon,
  ClockIcon,
  ComposeIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MinimizeIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  SystemIcon,
  TrashIcon,
} from '../../components/Icons'
import { CircularProgress } from '../../components/CircularProgress'
import { Dialog, DropdownMenu } from '../../components/ui'
import { InputBox } from '../chat/InputBox'
import { ModelSelector, type ModelSelectorHandle } from '../chat/ModelSelector'
import { ChatViewportProvider, type ChatViewportValue } from '../chat/chatViewport'
import { MessageRenderer } from '../message/MessageRenderer'
import { useTheme } from '../../hooks'
import { KtContextDetailsDialog } from './KtContextDetailsDialog'
import { KtProjectPicker } from './KtProjectPicker'
import { KtSettingsDialog } from './KtSettingsDialog'
import { KtAgentLauncherCard } from './KtSetupPanel'
import { getModelKey } from '../../utils/modelUtils'
import { useKtModels } from '../../hooks/useKtModels'
import { useKtSessions } from '../../hooks/useKtSessions'
import type { KtConnectionState, KtSessionInfo, KtTokenUsage } from '../../api/ktEvents'
import type { KtAgentStatus, KtRegistryEntry, KtSessionListItem } from '../../api/ktClient'
import type { Attachment } from '../attachment'
import type { ApiAgent } from '../../api'
import type { Message } from '../../types/message'

interface KtChatViewProps {
  messages: Message[]
  isStreaming: boolean
  sessionInfo: KtSessionInfo
  tokenUsage: KtTokenUsage
  connectionState: KtConnectionState
  agentInfo: KtAgentStatus | null
  agentId: string | null
  currentWorkspace: string | null
  currentSessionName: string | null
  runningAgents: KtAgentStatus[]
  configs: KtRegistryEntry[]
  isLoadingConfigs: boolean
  lastLauncherItemId: string | null
  error: string | null
  onSend: (text: string, attachments?: Attachment[], options?: { agent?: string; variant?: string }) => Promise<boolean>
  onCommand: (command: string) => Promise<boolean>
  onStop: () => void
  onClearError: () => void
  onResumeSession: (sessionName: string, workspace?: string) => Promise<void>
  onSelectAgent: (agentId: string) => void
  onStartAgent: (configPath: string, pwd?: string) => Promise<string>
  onInstallDefaults: () => Promise<boolean>
  onRefreshAgents: () => Promise<void>
  onRefreshConfigs: () => Promise<void>
  onLauncherStateChange: (state: { workspace: string; selectedItemId: string | null }) => void
  onWorkspaceInputChange: (workspace: string) => void
  onDisconnect: () => void
}

function buildViewport(viewportWidth: number, viewportHeight: number): ChatViewportValue {
  const compact = viewportWidth < 760
  const sidebarWidth = viewportWidth < 1024 ? 0 : 320

  return {
    presentation: {
      surfaceVariant: compact ? 'compact' : 'desktop',
      isCompact: compact,
    },
    interaction: {
      mode: compact ? 'touch' : 'pointer',
      touchCapable: compact,
      sidebarBehavior: viewportWidth < 1024 ? 'overlay' : 'docked',
      rightPanelBehavior: 'overlay',
      bottomPanelBehavior: compact ? 'overlay' : 'docked',
      outlineInteraction: compact ? 'touch' : 'pointer',
      enableCollapsedInputDock: compact,
    },
    layout: {
      viewportWidth,
      viewportHeight,
      surfaceWidth: Math.max(380, viewportWidth - sidebarWidth),
      surfaceMinWidth: 380,
      sidebar: {
        railWidth: 49,
        requestedWidth: 320,
        openWidth: 320,
        dockedWidth: sidebarWidth,
        overlayWidth: Math.min(340, viewportWidth - 24),
        hardMinWidth: 160,
        preferredMinWidth: 240,
        maxWidth: 480,
        resizeMaxWidth: 480,
      },
      rightPanel: {
        requestedWidth: 0,
        dockedWidth: 0,
        hardMinWidth: 160,
        maxWidth: 480,
        resizeMaxWidth: 480,
      },
      bottomPanel: {
        maxHeight: Math.floor(viewportHeight * 0.5),
      },
    },
    actions: {
      setSidebarRequestedWidth: () => {},
    },
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatSessionTime(value: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function KtSidebarFooter({
  sessionId,
  agentName,
  modelName,
  contextPercent,
  contextUsed,
  completionTokens,
  contextLimit,
  cachedTokens,
  connectionState,
  onDisconnect,
}: {
  sessionId: string
  agentName: string
  modelName: string
  contextPercent: number
  contextUsed: number
  completionTokens: number
  contextLimit: number
  cachedTokens: number
  connectionState: KtConnectionState
  onDisconnect: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [showContextDetails, setShowContextDetails] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { mode: themeMode, setThemeWithAnimation, isWideMode, toggleWideMode } = useTheme()

  const progressColor =
    contextPercent >= 90
      ? 'text-danger-100'
      : contextPercent >= 70
        ? 'text-warning-100'
        : contextPercent > 0
          ? 'text-accent-main-100'
          : 'text-text-500'

  const statusColor =
    connectionState === 'connected'
      ? 'bg-success-100'
      : connectionState === 'connecting'
        ? 'bg-warning-100 animate-pulse'
        : connectionState === 'error'
          ? 'bg-danger-100'
          : 'bg-text-500'

  const themeOptions = [
    { value: 'system' as const, icon: <SystemIcon size={14} /> },
    { value: 'light' as const, icon: <SunIcon size={14} /> },
    { value: 'dark' as const, icon: <MoonIcon size={14} /> },
  ]

  return (
    <div className="relative mt-auto border-t border-border-200/40 px-3 py-3">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center gap-3 rounded-2xl border border-border-200/60 bg-bg-200/65 px-3 py-2.5 text-left text-text-200 shadow-lg transition hover:border-border-300 hover:text-text-100"
        title={`Context: ${formatNumber(contextUsed)} / ${formatNumber(contextLimit)} • ${Math.round(contextPercent)}%`}
      >
        <div className="relative h-7 w-7 shrink-0">
          <CircularProgress
            progress={Math.min(Math.max(contextPercent, 0), 100) / 100}
            size={28}
            strokeWidth={3}
            trackClassName="text-bg-300"
            progressClassName={progressColor}
          />
          <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-200 ${statusColor}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[length:var(--fs-sm)] font-mono text-text-300">
              In {formatNumber(contextUsed)} / Out {formatNumber(completionTokens)} / Cached {formatNumber(cachedTokens)}
            </span>
            <span className={`shrink-0 text-[length:var(--fs-sm)] font-medium ${contextPercent >= 90 ? 'text-danger-100' : contextPercent >= 70 ? 'text-warning-100' : 'text-text-400'}`}>
              {Math.round(contextPercent)}%
            </span>
          </div>
          <div className="mt-0.5 text-[length:var(--fs-xs)] capitalize text-text-400">{connectionState}</div>
        </div>
      </button>

      <DropdownMenu triggerRef={triggerRef} isOpen={isOpen} position="top" align="left" minWidth={260}>
        <div className="w-[260px] overflow-hidden">
          <div className="border-b border-border-200/30 p-3">
            <div className="mb-2 flex items-center justify-between text-[length:var(--fs-sm)]">
              <span className="font-medium text-text-200">上下文用量</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-text-400">{Math.round(contextPercent)}%</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    setShowContextDetails(true)
                  }}
                  className="h-6 rounded-md border border-border-200/60 bg-bg-200/70 px-2 text-[length:var(--fs-xxs)] font-medium text-text-200 transition-colors hover:bg-bg-300"
                >
                  查看详情
                </button>
              </div>
            </div>

            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-bg-300">
              <div
                className={`h-full origin-left ${
                  contextPercent >= 90 ? 'bg-danger-100' : contextPercent >= 70 ? 'bg-warning-100' : 'bg-accent-main-100'
                }`}
                style={{ transform: `scaleX(${Math.min(Math.max(contextPercent, 0), 100) / 100})` }}
              />
            </div>

            <div className="flex items-center justify-between text-[length:var(--fs-xs)] font-mono text-text-400">
              <span>
                {formatNumber(contextUsed)} / {formatNumber(contextLimit)}
              </span>
              <span>Cached {formatNumber(cachedTokens)}</span>
            </div>
          </div>

          <div className="border-b border-border-200/30 p-2">
            <div className="mb-1.5 px-1 text-[length:var(--fs-xxs)] font-bold uppercase tracking-wider text-text-400">
              Appearance
            </div>
            <div className="relative flex rounded-lg border border-border-200/30 bg-bg-200/50 p-1 isolate">
              <div
                className="absolute bottom-1 top-1 w-[calc((100%-8px)/3)] rounded-md bg-bg-000 shadow-sm ring-1 ring-border-200/50 transition-transform duration-300 ease-out -z-10"
                style={{
                  transform:
                    themeMode === 'system'
                      ? 'translateX(0%)'
                      : themeMode === 'light'
                        ? 'translateX(100%)'
                        : 'translateX(200%)',
                }}
              />
              {themeOptions.map(option => (
                <button
                  key={option.value}
                  onClick={event => setThemeWithAnimation(option.value, event)}
                  className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors ${
                    themeMode === option.value ? 'text-text-100' : 'text-text-400 hover:text-text-200'
                  }`}
                >
                  {option.icon}
                </button>
              ))}
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false)
                toggleWideMode()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[length:var(--fs-sm)] text-text-300 transition-colors hover:bg-bg-200/50 hover:text-text-100"
            >
              {isWideMode ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
              <span>{isWideMode ? '标准宽度' : '宽屏模式'}</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false)
                setShowSettings(true)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[length:var(--fs-sm)] text-text-300 transition-colors hover:bg-bg-200/50 hover:text-text-100"
            >
              <CogIcon size={14} />
              <span>设置</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false)
                onDisconnect()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[length:var(--fs-sm)] text-text-300 transition-colors hover:bg-bg-200/50 hover:text-text-100"
            >
              <CogIcon size={14} />
              <span>Disconnect agent</span>
            </button>
          </div>
        </div>
      </DropdownMenu>

      <KtContextDetailsDialog
        isOpen={showContextDetails}
        onClose={() => setShowContextDetails(false)}
        sessionId={sessionId}
        agentName={agentName}
        model={modelName}
        contextLimit={contextLimit}
        promptTokens={contextUsed}
        completionTokens={completionTokens}
        cachedTokens={cachedTokens}
      />
      <KtSettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} initialTab="appearance" />
    </div>
  )
}

function SessionSidebar({
  sessions,
  isLoading,
  search,
  onSearchChange,
  onResumeSession,
  currentSessionName,
  currentWorkspace,
  onWorkspaceChange,
  sessionId,
  agentName,
  modelName,
  connectionState,
  contextPercent,
  contextUsed,
  completionTokens,
  contextLimit,
  cachedTokens,
  hasActiveAgent,
  runningAgents,
  configs,
  isLoadingConfigs,
  lastLauncherItemId,
  onSelectAgent,
  onStartAgent,
  onInstallDefaults,
  onRefreshAgents,
  onRefreshConfigs,
  onLauncherStateChange,
  onDisconnect,
}: {
  sessions: KtSessionListItem[]
  isLoading: boolean
  search: string
  onSearchChange: (search: string) => void
  onResumeSession: (sessionName: string, workspace?: string) => Promise<void>
  currentSessionName: string | null
  currentWorkspace: string | null
  onWorkspaceChange: (workspace: string | null) => void
  sessionId: string
  agentName: string
  modelName: string
  connectionState: KtConnectionState
  contextPercent: number
  contextUsed: number
  completionTokens: number
  contextLimit: number
  cachedTokens: number
  hasActiveAgent: boolean
  runningAgents: KtAgentStatus[]
  configs: KtRegistryEntry[]
  isLoadingConfigs: boolean
  lastLauncherItemId: string | null
  onSelectAgent: (agentId: string) => void
  onStartAgent: (configPath: string, pwd?: string) => Promise<string>
  onInstallDefaults: () => Promise<boolean>
  onRefreshAgents: () => Promise<void>
  onRefreshConfigs: () => Promise<void>
  onLauncherStateChange: (state: { workspace: string; selectedItemId: string | null }) => void
  onDisconnect: () => void
}) {
  const [launcherOpen, setLauncherOpen] = useState(false)

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border-200/50 bg-bg-100/95 backdrop-blur-xl">
      <div className="px-4 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[length:var(--fs-xs)] uppercase tracking-[0.18em] text-text-400">KohakuTerrarium</div>
            <div className="mt-1 text-[length:var(--fs-heading-3)] font-semibold text-text-100">KT Conversations</div>
          </div>
          <button
            type="button"
            onClick={() => setLauncherOpen(true)}
            className="rounded-lg border border-border-200/60 bg-bg-200/60 p-2 text-text-300 transition hover:border-border-300 hover:text-text-100"
            title={hasActiveAgent ? 'Switch or start agent' : 'Start or connect agent'}
          >
            <ComposeIcon size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border-200/60 bg-bg-200/45 px-3 py-2.5 focus-within:border-accent-main-100/60">
          <div className="flex items-center gap-2 text-text-400">
            <SearchIcon size={14} />
            <input
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder="Search KT sessions"
              className="w-full border-none bg-transparent text-[length:var(--fs-sm)] text-text-100 outline-none placeholder:text-text-400"
            />
          </div>
        </div>

        <div className="mt-3">
          <KtProjectPicker currentWorkspace={currentWorkspace} onChange={onWorkspaceChange} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 custom-scrollbar">
        {isLoading ? (
          <div className="px-3 py-8 text-[length:var(--fs-sm)] text-text-400">Loading KT sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="mx-2 rounded-2xl border border-dashed border-border-200/60 bg-bg-200/30 px-4 py-6 text-[length:var(--fs-sm)] text-text-400">
            No saved KT sessions in this workspace.
          </div>
        ) : (
          <div className="space-y-1.5">
            {sessions.map(session => {
              const isActive = currentSessionName === session.name
              return (
                <button
                  key={session.filename}
                  onClick={() => void onResumeSession(session.name, session.pwd)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    isActive
                      ? 'border-accent-main-100/50 bg-accent-main-100/10'
                      : 'border-transparent bg-bg-200/35 hover:border-border-200/70 hover:bg-bg-200/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`truncate text-[length:var(--fs-base)] font-medium ${isActive ? 'text-accent-main-100' : 'text-text-100'}`}>
                        {session.name}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[length:var(--fs-sm)] text-text-300">
                        {session.preview || session.config_path || 'No preview available'}
                      </div>
                    </div>
                    <MessageSquareIcon size={14} className="mt-0.5 shrink-0 text-text-400" />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[length:var(--fs-xs)] text-text-400">
                    <span className="truncate">{session.pwd || 'No workspace'}</span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <ClockIcon size={12} />
                      {formatSessionTime(session.last_active || session.created_at)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <KtSidebarFooter
        sessionId={sessionId}
        agentName={agentName}
        modelName={modelName}
        contextPercent={contextPercent}
        contextUsed={contextUsed}
        completionTokens={completionTokens}
        contextLimit={contextLimit}
        cachedTokens={cachedTokens}
        connectionState={connectionState}
        onDisconnect={onDisconnect}
      />

      <Dialog isOpen={launcherOpen} onClose={() => setLauncherOpen(false)} title="Agent Launcher" width="min(92vw, 560px)">
        <KtAgentLauncherCard
          onSelectAgent={agentId => {
            onSelectAgent(agentId)
            setLauncherOpen(false)
          }}
          onStartAgent={async (configPath, pwd) => {
            const agentId = await onStartAgent(configPath, pwd)
            setLauncherOpen(false)
            return agentId
          }}
          onInstallDefaults={onInstallDefaults}
          onRefreshAgents={onRefreshAgents}
          onRefreshConfigs={onRefreshConfigs}
          runningAgents={runningAgents}
          configs={configs}
          isLoadingConfigs={isLoadingConfigs}
          error={null}
          initialWorkspace={currentWorkspace ?? ''}
          initialSelectedItemId={lastLauncherItemId}
          onStateChange={onLauncherStateChange}
        />
      </Dialog>
    </aside>
  )
}

export function KtChatView({
  messages,
  isStreaming,
  sessionInfo,
  tokenUsage,
  connectionState,
  agentInfo,
  agentId,
  currentWorkspace,
  currentSessionName,
  runningAgents,
  configs,
  isLoadingConfigs,
  lastLauncherItemId,
  error,
  onSend,
  onCommand,
  onStop,
  onClearError,
  onResumeSession,
  onSelectAgent,
  onStartAgent,
  onInstallDefaults,
  onRefreshAgents,
  onRefreshConfigs,
  onLauncherStateChange,
  onWorkspaceInputChange,
  onDisconnect,
}: KtChatViewProps) {
  const modelSelectorRef = useRef<ModelSelectorHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputBoxWrapperRef = useRef<HTMLDivElement>(null)
  const [sessionSearch, setSessionSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessionWorkspaceFilter, setSessionWorkspaceFilter] = useState<string | null>(null)
  const [selectedAgentMode, setSelectedAgentMode] = useState<string>('general')
  const [inputBoxHeight, setInputBoxHeight] = useState(184)
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))

  const { models, isLoading: modelsLoading, selectedModelKey, selectedVariant, canSwitchVariant, switchModel, switchVariant } = useKtModels({
    agentId,
    currentModel: sessionInfo.model || null,
  })
  const { sessions, isLoading: sessionsLoading } = useKtSessions({ workspace: sessionWorkspaceFilter })

  const messageList = useMemo(() => [...messages], [messages])
  const visibleSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter(session => {
      const haystack = [session.name, session.preview, session.config_path, session.pwd].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [sessionSearch, sessions])

  const handleModelChange = useCallback(
    async (modelKey: string) => {
      const nextModel = models.find(model => getModelKey(model) === modelKey)
      if (!nextModel) return
      await switchModel(modelKey, nextModel)
    },
    [models, switchModel],
  )

  const currentModel = selectedModelKey
    ? models.find(model => getModelKey(model) === selectedModelKey)
    : null
  const hasActiveAgent = Boolean(agentId)
  const viewport = useMemo(() => buildViewport(viewportSize.width, viewportSize.height), [viewportSize.height, viewportSize.width])
  const contextLimit = sessionInfo.maxContext || 0
  const contextUsed = tokenUsage.lastPrompt || 0
  const contextPercent = contextLimit > 0 ? (contextUsed / contextLimit) * 100 : 0
  const cachedTokens = tokenUsage.cached || 0
  const agentModes = useMemo<ApiAgent[]>(() => {
    const primary = agentInfo?.name ?? 'general'
    const subagents = (agentInfo?.subagents ?? []).map(name => ({
      id: name,
      name,
      mode: 'task',
      hidden: false,
      description: `KT specialist: ${name}`,
      permission: [],
    }))
    return [
      {
        id: primary,
        name: primary,
        mode: 'primary',
        hidden: false,
        description: 'Current KT agent',
        permission: [],
      },
      ...subagents,
    ] as unknown as ApiAgent[]
  }, [agentInfo?.name, agentInfo?.subagents])
  const fileCapabilities = useMemo(
    () => ({
      image: true,
      pdf: true,
      audio: true,
      video: true,
    }),
    [],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messageList, isStreaming])

  useEffect(() => {
    setSelectedAgentMode(agentInfo?.name ?? 'general')
  }, [agentInfo?.name])

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    setSessionWorkspaceFilter(currentWorkspace)
  }, [currentWorkspace])

  useEffect(() => {
    const el = inputBoxWrapperRef.current
    if (!el) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setInputBoxHeight(Math.ceil(entry.contentRect.height))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <ChatViewportProvider value={viewport}>
      <div className="relative flex h-[var(--app-height)] bg-bg-100 text-text-100 overflow-hidden">
        <div className="hidden lg:flex">
          <SessionSidebar
            sessions={visibleSessions}
            isLoading={sessionsLoading}
            search={sessionSearch}
            onSearchChange={setSessionSearch}
            onResumeSession={onResumeSession}
            currentSessionName={currentSessionName}
            currentWorkspace={sessionWorkspaceFilter}
            onWorkspaceChange={setSessionWorkspaceFilter}
            sessionId={sessionInfo.sessionId}
            agentName={sessionInfo.agentName || agentInfo?.name || 'KT Agent'}
            modelName={sessionInfo.model}
            connectionState={connectionState}
            contextPercent={contextPercent}
            contextUsed={contextUsed}
            completionTokens={tokenUsage.completion}
            contextLimit={contextLimit}
            cachedTokens={cachedTokens}
            hasActiveAgent={Boolean(agentId)}
            runningAgents={runningAgents}
            configs={configs}
            isLoadingConfigs={isLoadingConfigs}
            lastLauncherItemId={lastLauncherItemId}
            onSelectAgent={onSelectAgent}
            onStartAgent={onStartAgent}
            onInstallDefaults={onInstallDefaults}
            onRefreshAgents={onRefreshAgents}
            onRefreshConfigs={onRefreshConfigs}
            onLauncherStateChange={onLauncherStateChange}
            onDisconnect={onDisconnect}
          />
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="relative h-full w-[86vw] max-w-[340px]" onClick={event => event.stopPropagation()}>
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-xl border border-border-200/60 bg-bg-100/80 p-2 text-text-300"
              >
                <CloseIcon size={14} />
              </button>
              <SessionSidebar
                sessions={visibleSessions}
                isLoading={sessionsLoading}
                search={sessionSearch}
                onSearchChange={setSessionSearch}
                onResumeSession={async (sessionName, workspace) => {
                  await onResumeSession(sessionName, workspace)
                  setSidebarOpen(false)
                }}
                currentSessionName={currentSessionName}
                currentWorkspace={sessionWorkspaceFilter}
                onWorkspaceChange={setSessionWorkspaceFilter}
                sessionId={sessionInfo.sessionId}
                agentName={sessionInfo.agentName || agentInfo?.name || 'KT Agent'}
                modelName={sessionInfo.model}
                connectionState={connectionState}
                contextPercent={contextPercent}
                contextUsed={contextUsed}
                completionTokens={tokenUsage.completion}
                contextLimit={contextLimit}
                cachedTokens={cachedTokens}
                hasActiveAgent={Boolean(agentId)}
                runningAgents={runningAgents}
                configs={configs}
                isLoadingConfigs={isLoadingConfigs}
                lastLauncherItemId={lastLauncherItemId}
                onSelectAgent={onSelectAgent}
                onStartAgent={onStartAgent}
                onInstallDefaults={onInstallDefaults}
                onRefreshAgents={onRefreshAgents}
                onRefreshConfigs={onRefreshConfigs}
                onLauncherStateChange={onLauncherStateChange}
                onDisconnect={onDisconnect}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col bg-bg-100">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-200/50 bg-bg-100/92 px-4 backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex rounded-xl border border-border-200/60 bg-bg-200/70 px-3 py-2 text-text-300 transition hover:border-border-300 hover:text-text-100 lg:hidden"
              >
                <MessageSquareIcon size={14} />
              </button>

              <ModelSelector
                ref={modelSelectorRef}
                models={models}
                selectedModelKey={selectedModelKey}
                onSelect={(modelKey, _model) => void handleModelChange(modelKey)}
                isLoading={modelsLoading}
              />
            </div>

            <div className="flex items-center gap-3 text-[length:var(--fs-sm)]">
              {hasActiveAgent && (
                <button
                  onClick={onDisconnect}
                  className="rounded-xl border border-border-200/60 px-3 py-1.5 text-text-300 transition hover:border-danger-100/50 hover:text-danger-100"
                >
                  Disconnect
                </button>
              )}
            </div>
          </header>

          {error && (
            <div className="flex items-center justify-between border-b border-danger-100/20 bg-danger-bg/85 px-4 py-2 text-[length:var(--fs-sm)] text-danger-100">
              <span className="truncate">{error}</span>
              <button onClick={onClearError} className="shrink-0 text-text-200 transition hover:text-danger-100">
                <TrashIcon size={14} />
              </button>
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} className="h-full overflow-y-auto custom-scrollbar">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8" style={{ paddingBottom: inputBoxHeight + 48 }}>
                <div className="flex flex-wrap items-center gap-3 text-[length:var(--fs-sm)] text-text-300">
                  <span className="rounded-full border border-border-200/60 bg-bg-200/45 px-3 py-1">{agentInfo?.name ?? 'KT Agent'}</span>
                  {currentModel && (
                    <span className="rounded-full border border-border-200/60 bg-bg-200/45 px-3 py-1">{currentModel.name}</span>
                  )}
                  {currentWorkspace && (
                    <span className="rounded-full border border-border-200/60 bg-bg-200/45 px-3 py-1">{currentWorkspace}</span>
                  )}
                </div>

                {messageList.length === 0 ? (
                  <div className="mx-auto mt-24 w-full max-w-2xl rounded-3xl border border-border-200/60 bg-bg-200/30 px-10 py-14 text-center shadow-lg shadow-black/10">
                    <div className="text-[length:var(--fs-heading-2)] font-semibold text-text-100">{hasActiveAgent ? 'Ready to chat with KT' : 'Choose an agent to begin'}</div>
                    <div className="mt-3 text-[length:var(--fs-base)] text-text-300">
                      {hasActiveAgent ? 'Pick a session from the left or start a new conversation below.' : 'Use the launcher button in the left sidebar to connect a running agent or start one from a config.'}
                    </div>
                  </div>
                ) : (
                  messageList.map(message => (
                    <MessageRenderer key={message.info.id} message={message} allowStreamingLayoutAnimation={true} />
                  ))
                )}
              </div>
            </div>

            <div ref={inputBoxWrapperRef} className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none px-6 pb-4">
              {isStreaming && (
                <div className="pointer-events-none absolute bottom-full inset-x-0 flex justify-center pb-2">
                  <div className="rounded-lg border border-border-200/60 glass px-3 py-1.5 text-[length:var(--fs-sm)] text-warning-100 shadow-lg">
                    KT is processing your request.
                  </div>
                </div>
              )}

              <div className="mx-auto max-w-4xl pointer-events-auto">
                {hasActiveAgent ? (
                  <InputBox
                    paneId="kt-pane"
                    onSend={(text: string, attachments, options) => onSend(text, attachments, options)}
                    onCommand={onCommand}
                    onAbort={onStop}
                    disabled={false}
                    isStreaming={isStreaming}
                    agents={agentModes}
                    selectedAgent={selectedAgentMode}
                    onAgentChange={setSelectedAgentMode}
                    variants={canSwitchVariant ? currentModel?.variants ?? [] : []}
                    selectedVariant={canSwitchVariant ? selectedVariant : undefined}
                    onVariantChange={variant => void switchVariant(variant)}
                    fileCapabilities={fileCapabilities}
                    models={models}
                    selectedModelKey={selectedModelKey}
                    onModelChange={(modelKey, model) => void switchModel(modelKey, model)}
                    modelsLoading={modelsLoading}
                    modelSelectorRef={modelSelectorRef}
                    rootPath={currentWorkspace ?? ''}
                    sessionId={currentSessionName}
                  />
                ) : (
                  <div className="rounded-[28px] border border-border-200/60 bg-bg-200/55 px-6 py-5 text-center text-[length:var(--fs-sm)] text-text-300 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.75)]">
                    <div>Open the left sidebar launcher to connect a running agent or start a new one.</div>
                    <div className="mt-4 text-left">
                      <label htmlFor="kt-inline-workspace" className="mb-1.5 block text-[length:var(--fs-xs)] font-medium uppercase tracking-wider text-text-400">
                        Workspace directory
                      </label>
                      <input
                        id="kt-inline-workspace"
                        type="text"
                        value={currentWorkspace ?? ''}
                        onChange={event => onWorkspaceInputChange(event.target.value)}
                        placeholder="Optional, e.g. F:\\AI\\KohakuTerrarium"
                        className="h-11 w-full rounded-xl border border-border-200 bg-bg-000/70 px-4 py-2 text-sm text-text-100 shadow-sm outline-none placeholder:text-text-400 focus:border-accent-main-100"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChatViewportProvider>
  )
}
