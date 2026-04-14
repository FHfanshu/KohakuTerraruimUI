// ============================================
// KtSetupPanel - Compact agent selector UI
// Single-screen with dropdown + search
// ============================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { KtRegistryEntry, KtAgentStatus } from '../../api/ktClient'

interface KtSetupPanelProps {
  onSelectAgent: (agentId: string) => void
  onStartAgent: (configPath: string, pwd?: string) => Promise<string>
  onInstallDefaults: () => Promise<boolean>
  onRefreshAgents: () => Promise<void>
  onRefreshConfigs: () => Promise<void>
  runningAgents: KtAgentStatus[]
  configs: KtRegistryEntry[]
  isLoadingConfigs: boolean
  error: string | null
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${running ? 'bg-success-100' : 'bg-text-400'}`}
    />
  )
}

interface DropdownItem {
  id: string
  type: 'running' | 'config' | 'install'
  label: string
  sublabel?: string
  agentId?: string
  configPath?: string
  tools?: string[]
  running?: boolean
}

function AgentDropdown({
  runningAgents,
  configs,
  isLoadingConfigs,
  selectedItemId,
  onPickItem,
}: {
  runningAgents: KtAgentStatus[]
  configs: KtRegistryEntry[]
  isLoadingConfigs: boolean
  selectedItemId: string | null
  onPickItem: (item: DropdownItem) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const items = useMemo<DropdownItem[]>(() => {
    const result: DropdownItem[] = []

    for (const agent of runningAgents) {
      result.push({
        id: `running-${agent.agent_id}`,
        type: 'running',
        label: agent.name,
        sublabel: agent.model,
        agentId: agent.agent_id,
        tools: agent.tools,
        running: agent.running,
      })
    }

    const creatureConfigs = configs.filter(c => c.type === 'creature')
    for (const cfg of creatureConfigs) {
      result.push({
        id: `config-${cfg.path}`,
        type: 'config',
        label: cfg.name,
        sublabel: cfg.description || cfg.source,
        configPath: cfg.path,
        tools: cfg.tools,
      })
    }

    if (creatureConfigs.length === 0 && !isLoadingConfigs) {
      result.push({
        id: 'install-defaults',
        type: 'install',
        label: 'Install kt-defaults',
        sublabel: 'Get started with default agents',
      })
    }

    return result
  }, [runningAgents, configs, isLoadingConfigs])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q) ||
        item.tools?.some(t => t.toLowerCase().includes(q)),
    )
  }, [items, search])

  const open = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320) })
    setIsOpen(true)
    setSearch('')
    setFocusedIndex(-1)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setSearch('')
    triggerRef.current?.focus()
  }, [])

  const handleSelect = useCallback(
    (item: DropdownItem) => {
      onPickItem(item)
      close()
    },
    [onPickItem, close],
  )

  useEffect(() => {
    if (!isOpen) return

    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          close()
          break
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex(i => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex >= 0 && focusedIndex < filtered.length) {
            handleSelect(filtered[focusedIndex])
          }
          break
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, filtered, focusedIndex, close, handleSelect])

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [isOpen])

  const runningItems = filtered.filter(i => i.type === 'running')
  const configItems = filtered.filter(i => i.type === 'config')
  const otherItems = filtered.filter(i => i.type === 'install')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-border-200 bg-bg-000 px-4 py-2 text-left text-sm text-text-100 shadow-sm transition hover:border-accent-main-100 hover:bg-bg-100 focus:outline-none focus:ring-2 focus:ring-accent-main-100/30"
      >
        <span className="truncate text-text-300">
          {items.find(item => item.id === selectedItemId)?.label ?? 'Select an agent...'}
        </span>
        <svg className="h-4 w-4 text-text-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50"
            onClick={close}
          >
            <div
              ref={menuRef}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              className="absolute z-50 overflow-hidden rounded-xl border border-border-200 bg-bg-000 shadow-xl shadow-black/20"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-2 border-b border-border-200">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value)
                    setFocusedIndex(-1)
                  }}
                  placeholder="Search agents, models, tools..."
                  className="w-full rounded-lg border border-border-200 bg-bg-100 px-3 py-2 text-sm text-text-100 placeholder:text-text-400 outline-none focus:border-accent-main-100"
                />
              </div>

              <div className="max-h-80 overflow-y-auto p-1">
                {isLoadingConfigs && filtered.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-text-400">
                    Loading...
                  </div>
                )}

                {!isLoadingConfigs && filtered.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-text-400">
                    No agents found
                  </div>
                )}

                {runningItems.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-400">
                      Running Agents
                    </div>
                      {runningItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                          focusedIndex === filtered.indexOf(item) || selectedItemId === item.id
                            ? 'bg-accent-main-100/10 text-text-100'
                            : 'text-text-100 hover:bg-bg-100'
                        }`}
                      >
                        <StatusDot running={item.running ?? false} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{item.label}</div>
                          <div className="truncate text-xs text-text-400">{item.sublabel}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-bg-300 px-1.5 py-0.5 text-[10px] text-text-400">
                          {item.tools?.length ?? 0} tools
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {configItems.length > 0 && (
                  <div className={runningItems.length > 0 ? 'mt-1 pt-1 border-t border-border-200' : ''}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-400">
                      Available Agents
                    </div>
                    {configItems.map((item) => {
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            focusedIndex === filtered.indexOf(item) || selectedItemId === item.id
                              ? 'bg-accent-main-100/10 text-text-100'
                              : 'text-text-100 hover:bg-bg-100'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full bg-text-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{item.label}</div>
                            <div className="truncate text-xs text-text-400">{item.sublabel}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-bg-200 px-1.5 py-0.5 text-[10px] text-text-300">
                            {item.tools?.length ?? 0} tools
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {otherItems.length > 0 && (
                  <div className={runningItems.length > 0 || configItems.length > 0 ? 'mt-1 pt-1 border-t border-border-200' : ''}>
                    {otherItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-100 transition hover:bg-bg-100 disabled:opacity-50"
                      >
                        <span className="h-2 w-2 rounded-full bg-text-400 shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-text-400">{item.sublabel}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function KtSetupPanel({
  onSelectAgent,
  onStartAgent,
  onInstallDefaults,
  onRefreshAgents,
  onRefreshConfigs,
  runningAgents,
  configs,
  isLoadingConfigs,
  error,
}: KtSetupPanelProps) {
  const [startingConfig, setStartingConfig] = useState<string | null>(null)
  const [workspaceDir, setWorkspaceDir] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<DropdownItem | null>(null)

  useEffect(() => {
    void onRefreshAgents()
    void onRefreshConfigs()
  }, [onRefreshAgents, onRefreshConfigs])

  const handleInstallDefaults = useCallback(async () => {
    setInstalling(true)
    setInstallError(null)
    try {
      const ok = await onInstallDefaults()
      if (!ok) {
        setInstallError('Installation failed. Check the kt web console for details.')
      } else {
        void onRefreshConfigs()
      }
    } finally {
      setInstalling(false)
    }
  }, [onInstallDefaults, onRefreshConfigs])

  const handleStartConfig = useCallback(
    async (configPath: string) => {
      setStartingConfig(configPath)
      setStartError(null)
      try {
        const agentId = await onStartAgent(configPath, workspaceDir.trim() || undefined)
        onSelectAgent(agentId)
      } catch (err) {
        setStartError(err instanceof Error ? err.message : 'Failed to start agent')
      } finally {
        setStartingConfig(null)
      }
    },
    [onStartAgent, onSelectAgent, workspaceDir],
  )

  const handlePrimaryAction = useCallback(async () => {
    if (!selectedItem) return

    if (selectedItem.type === 'running' && selectedItem.agentId) {
      setStartError(null)
      onSelectAgent(selectedItem.agentId)
      return
    }

    if (selectedItem.type === 'config' && selectedItem.configPath) {
      await handleStartConfig(selectedItem.configPath)
      return
    }

    if (selectedItem.type === 'install') {
      await handleInstallDefaults()
    }
  }, [selectedItem, onSelectAgent, handleStartConfig, handleInstallDefaults])

  const primaryLabel =
    selectedItem?.type === 'running'
      ? 'Connect'
      : selectedItem?.type === 'config'
        ? 'Start Agent'
        : selectedItem?.type === 'install'
          ? 'Install Defaults'
          : 'Choose an agent'

  return (
    <div className="flex h-full items-center justify-center bg-bg-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-200 bg-bg-200/60 p-6 shadow-lg shadow-black/5">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-100">KohakuTerrarium</h1>
          <p className="mt-1 text-sm text-text-300">Browser-only KT agent chat</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-danger-100/30 bg-danger-bg/80 px-4 py-3 text-sm text-danger-200">
            <div className="font-medium">Backend unreachable</div>
            <div className="mt-0.5 text-xs text-danger-100">
                Ensure <code className="rounded bg-bg-000 px-1">kt web --dev</code> is running on port 8001
            </div>
          </div>
        )}

        {installError && (
          <div className="mb-4 rounded-xl border border-warning-100/30 bg-warning-bg/80 px-4 py-3 text-sm text-warning-200">
            {installError}
          </div>
        )}

        {startError && (
          <div className="mb-4 rounded-xl border border-danger-100/30 bg-danger-bg/80 px-4 py-3 text-sm text-danger-200">
            {startError}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="kt-workspace" className="block text-xs font-medium uppercase tracking-wider text-text-300">
              Workspace directory
            </label>
            <input
              id="kt-workspace"
              type="text"
              value={workspaceDir}
              onChange={e => setWorkspaceDir(e.target.value)}
              placeholder="Optional, e.g. F:\\AI\\KohakuTerrarium"
              className="h-11 w-full rounded-xl border border-border-200 bg-bg-000 px-4 py-2 text-sm text-text-100 shadow-sm outline-none placeholder:text-text-400 focus:border-accent-main-100"
            />
            <div className="text-xs text-text-400">
              Passed to KT as the agent working directory (`pwd`). Leave empty to use backend default.
            </div>
          </div>

          <AgentDropdown
            runningAgents={runningAgents}
            configs={configs}
            isLoadingConfigs={isLoadingConfigs}
            selectedItemId={selectedItem?.id ?? null}
            onPickItem={setSelectedItem}
          />

          {selectedItem && (
            <div className="rounded-xl border border-border-200 bg-bg-000 px-4 py-3">
              <div className="text-sm font-medium text-text-100">{selectedItem.label}</div>
              {selectedItem.sublabel && <div className="mt-1 text-xs text-text-400">{selectedItem.sublabel}</div>}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={!selectedItem || startingConfig !== null || installing}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-accent-main-000 px-4 text-sm font-medium text-oncolor-100 transition hover:bg-accent-main-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startingConfig !== null ? 'Starting...' : installing ? 'Installing...' : primaryLabel}
          </button>

          <div className="text-center text-xs text-text-400">
            {runningAgents.length > 0 && (
              <span>{runningAgents.length} agent{runningAgents.length !== 1 ? 's' : ''} running</span>
            )}
            {runningAgents.length > 0 && configs.filter(c => c.type === 'creature').length > 0 && (
              <span className="mx-1">·</span>
            )}
            {configs.filter(c => c.type === 'creature').length > 0 && (
              <span>{configs.filter(c => c.type === 'creature').length} configs available</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
