import { useCallback, useEffect, useMemo, useState } from 'react'

import { ktListSessions, type KtSessionListItem } from '../api/ktClient'

interface UseKtSessionsOptions {
  workspace: string | null
}

export function useKtSessions({ workspace }: UseKtSessionsOptions) {
  const [sessions, setSessions] = useState<KtSessionListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await ktListSessions({ limit: 100, search: search.trim() || undefined })
      setSessions(response.sessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KT sessions')
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filteredSessions = useMemo(() => {
    if (!workspace) {
      return sessions
    }
    return sessions.filter(session => session.pwd === workspace)
  }, [sessions, workspace])

  const workspaces = useMemo(() => {
    return Array.from(new Set(sessions.map(session => session.pwd).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [sessions])

  return {
    sessions: filteredSessions,
    allSessions: sessions,
    workspaces,
    isLoading,
    error,
    search,
    setSearch,
    refresh,
  }
}
