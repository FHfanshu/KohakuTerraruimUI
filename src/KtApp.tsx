// ============================================
// KtApp - Main KT Application
// Single-agent KT chat using OpenCodeUI visual style
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { KtChatView } from './features/kt/KtChatView'
import { useKtAgent } from './hooks/useKtAgent'
import { ktListAgents, ktResumeSession } from './api/ktClient'
import type { KtAgentStatus } from './api/ktClient'

const KT_LAST_WORKSPACE_KEY = 'kt:last-workspace'
const KT_LAST_LAUNCHER_ITEM_KEY = 'kt:last-launcher-item'

function KtAppInner({
  initialAgentId,
}: {
  initialAgentId: string | null
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId)
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(() => localStorage.getItem(KT_LAST_WORKSPACE_KEY) || null)
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null)
  const [lastLauncherItemId, setLastLauncherItemId] = useState<string | null>(() => localStorage.getItem(KT_LAST_LAUNCHER_ITEM_KEY) || null)

  const {
    connectionState,
    agentInfo,
    sessionInfo,
    tokenUsage,
    isStreaming,
    messages,
    sendMessage,
    executeCommand,
    abort,
    installKtDefaults,
    refreshConfigs,
    configs,
    isLoadingConfig,
    startAgent,
    stopAgent,
    error,
    clearError,
  } = useKtAgent({ agentId: selectedAgentId })

  // Running agents from API
  const [runningAgents, setRunningAgents] = useState<KtAgentStatus[]>([])

  const loadRunningAgents = useCallback(async () => {
    try {
      const agents = await ktListAgents()
      setRunningAgents(agents)
    } catch {
      // Backend not reachable
      setRunningAgents([])
    }
  }, [])

  useEffect(() => {
    void loadRunningAgents()
    void refreshConfigs()
  }, [loadRunningAgents, refreshConfigs])

  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem(KT_LAST_WORKSPACE_KEY, currentWorkspace)
    } else {
      localStorage.removeItem(KT_LAST_WORKSPACE_KEY)
    }
  }, [currentWorkspace])

  useEffect(() => {
    if (lastLauncherItemId) {
      localStorage.setItem(KT_LAST_LAUNCHER_ITEM_KEY, lastLauncherItemId)
    } else {
      localStorage.removeItem(KT_LAST_LAUNCHER_ITEM_KEY)
    }
  }, [lastLauncherItemId])

  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      setCurrentSessionName(null)
      setSelectedAgentId(agentId)
    },
    [],
  )

  const handleStartAgent = useCallback(
    async (configPath: string, pwd?: string): Promise<string> => {
      const agentId = await startAgent(configPath, pwd)
      setCurrentWorkspace(pwd ?? null)
      setCurrentSessionName(null)
      setSelectedAgentId(agentId)
      void loadRunningAgents()
      return agentId
    },
    [loadRunningAgents, startAgent],
  )

  const handleResumeSession = useCallback(async (sessionName: string, workspace?: string) => {
    const result = await ktResumeSession(sessionName)
    if (result.type !== 'agent') {
      throw new Error(`Unsupported session type: ${result.type}`)
    }
    setCurrentSessionName(result.session_name)
    setCurrentWorkspace(workspace ?? null)
    setSelectedAgentId(result.instance_id)
  }, [])

  const handleDisconnect = useCallback(async () => {
    await stopAgent()
    setSelectedAgentId(null)
    setCurrentSessionName(null)
    void loadRunningAgents()
  }, [stopAgent, loadRunningAgents])

  const handleLauncherStateChange = useCallback((state: { workspace: string; selectedItemId: string | null }) => {
    setCurrentWorkspace(state.workspace.trim() || null)
    setLastLauncherItemId(state.selectedItemId)
  }, [])

  const handleWorkspaceInputChange = useCallback((workspace: string) => {
    setCurrentWorkspace(workspace.trim() || null)
  }, [])

  return (
    <KtChatView
      messages={messages}
      isStreaming={isStreaming}
      sessionInfo={sessionInfo}
      tokenUsage={tokenUsage}
      connectionState={connectionState}
      agentInfo={agentInfo}
      agentId={selectedAgentId}
      error={error}
      currentWorkspace={currentWorkspace ?? agentInfo?.pwd ?? null}
      currentSessionName={currentSessionName}
      runningAgents={runningAgents}
      configs={configs}
      isLoadingConfigs={isLoadingConfig}
      lastLauncherItemId={lastLauncherItemId}
      onSend={sendMessage}
      onCommand={executeCommand}
      onStop={abort}
      onClearError={clearError}
      onResumeSession={handleResumeSession}
      onSelectAgent={handleSelectAgent}
      onStartAgent={handleStartAgent}
      onInstallDefaults={installKtDefaults}
      onRefreshAgents={loadRunningAgents}
      onRefreshConfigs={refreshConfigs}
      onLauncherStateChange={handleLauncherStateChange}
      onWorkspaceInputChange={handleWorkspaceInputChange}
      onDisconnect={handleDisconnect}
    />
  )
}

export function KtApp() {
  return <KtAppInner initialAgentId={null} />
}

export default KtApp
