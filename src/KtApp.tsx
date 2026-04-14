// ============================================
// KtApp - Main KT Application
// Single-agent KT chat using OpenCodeUI visual style
// ============================================

import { useCallback, useEffect, useState } from 'react'
import { KtSetupPanel } from './features/kt/KtSetupPanel'
import { KtChatView } from './features/kt/KtChatView'
import { useKtAgent } from './hooks/useKtAgent'
import { ktListAgents, ktResumeSession } from './api/ktClient'
import type { KtAgentStatus } from './api/ktClient'

function KtAppInner({
  initialAgentId,
}: {
  initialAgentId: string | null
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialAgentId)
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null)
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null)

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
    if (!selectedAgentId) {
      void loadRunningAgents()
    }
  }, [selectedAgentId, loadRunningAgents])

  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      setCurrentSessionName(null)
      setCurrentWorkspace(null)
      setSelectedAgentId(agentId)
    },
    [],
  )

  const handleStartAgent = useCallback(
    async (configPath: string, pwd?: string): Promise<string> => {
      const agentId = await startAgent(configPath, pwd)
      setCurrentWorkspace(pwd ?? null)
      setCurrentSessionName(null)
      return agentId
    },
    [startAgent],
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

  // If no agent selected, show setup
  if (!selectedAgentId) {
    return (
      <KtSetupPanel
        onSelectAgent={handleSelectAgent}
        onStartAgent={handleStartAgent}
        onInstallDefaults={installKtDefaults}
        onRefreshAgents={loadRunningAgents}
        onRefreshConfigs={refreshConfigs}
        runningAgents={runningAgents}
        configs={configs}
        isLoadingConfigs={isLoadingConfig}
        error={error}
      />
    )
  }

  // Show chat view
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
      onSend={sendMessage}
      onCommand={executeCommand}
      onStop={abort}
      onClearError={clearError}
      onResumeSession={handleResumeSession}
      onDisconnect={handleDisconnect}
    />
  )
}

export function KtApp() {
  return <KtAppInner initialAgentId={null} />
}

export default KtApp
