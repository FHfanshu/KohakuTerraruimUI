import { useCallback, useEffect, useMemo, useState } from 'react'

import { FolderIcon, GlobeIcon, PlusIcon, TrashIcon } from '../../components/Icons'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { serverStorage } from '../../utils'
import { getDirectoryName, isSameDirectory, normalizeToForwardSlash } from '../../utils/directoryUtils'

const STORAGE_KEY_SAVED = 'kt-saved-directories'
const STORAGE_KEY_RECENT = 'kt-recent-directories'

interface KtProjectLike {
  id: string
  name: string
  worktree: string
}

interface FileTreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  children?: FileTreeNode[]
}

async function listKtDirectory(root: string): Promise<FileTreeNode[]> {
  const params = new URLSearchParams({ root, depth: '1' })
  const response = await fetch(`/api/files/tree?${params.toString()}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const tree = (await response.json()) as FileTreeNode
  return (tree.children ?? []).filter(node => node.type === 'directory')
}

function getHomeCandidates(): string[] {
  return ['C:/Users/FHfanshu', 'F:/AI', 'C:/Users']
}

function makeProject(path: string): KtProjectLike {
  const normalized = normalizeToForwardSlash(path)
  return {
    id: normalized || 'global',
    name: getDirectoryName(normalized) || normalized || 'Global',
    worktree: normalized,
  }
}

function loadSavedProjects(): KtProjectLike[] {
  const saved = serverStorage.getJSON<string[]>(STORAGE_KEY_SAVED) ?? []
  return saved.map(makeProject)
}

function persistProjects(projects: KtProjectLike[]): void {
  serverStorage.setJSON(
    STORAGE_KEY_SAVED,
    projects.filter(project => project.id !== 'global').map(project => project.worktree),
  )
}

function touchRecent(path: string): void {
  const current = serverStorage.getJSON<Record<string, number>>(STORAGE_KEY_RECENT) ?? {}
  current[normalizeToForwardSlash(path)] = Date.now()
  serverStorage.setJSON(STORAGE_KEY_RECENT, current)
}

function ProjectDialog({
  isOpen,
  onClose,
  onSelect,
  initialPath,
}: {
  isOpen: boolean
  onClose: () => void
  onSelect: (path: string) => void
  initialPath?: string
}) {
  const [inputValue, setInputValue] = useState(initialPath || '')
  const [items, setItems] = useState<FileTreeNode[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentDir = useMemo(() => {
    const normalized = normalizeToForwardSlash(inputValue)
    if (!normalized) return ''
    if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}/`
    if (normalized.endsWith('/')) return normalized
    const idx = normalized.lastIndexOf('/')
    return idx >= 0 ? normalized.slice(0, idx + 1) : `${normalized}/`
  }, [inputValue])

  useEffect(() => {
    if (!isOpen) return
    setInputValue(initialPath || getHomeCandidates()[0])
    setSelectedIndex(0)
  }, [initialPath, isOpen])

  useEffect(() => {
    if (!isOpen || !currentDir) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    void listKtDirectory(currentDir)
      .then(nodes => {
        if (cancelled) return
        setItems(nodes)
        setSelectedIndex(0)
      })
      .catch(err => {
        if (cancelled) return
        setItems([])
        setError(err instanceof Error ? err.message : 'Failed to list directory')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentDir, isOpen])

  const goUp = useCallback(() => {
    const normalized = normalizeToForwardSlash(currentDir).replace(/\/$/, '')
    const idx = normalized.lastIndexOf('/')
    if (idx <= 0) return
    setInputValue(normalized.slice(0, idx))
  }, [currentDir])

  return (
    <Dialog isOpen={isOpen} onClose={onClose} rawContent width={560} showCloseButton={false} className="h-[460px]">
      <div className="p-4 pb-2 shrink-0">
        <div className="relative flex items-center rounded-xl border border-border-200 bg-bg-000/40 px-3 py-2.5 transition-colors focus-within:border-accent-main-100/50">
          <FolderIcon className="mr-2.5 h-4 w-4 shrink-0 text-text-400" />
          <input
            type="text"
            value={inputValue}
            onChange={event => setInputValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                onSelect(inputValue)
                onClose()
              }
            }}
            className="flex-1 border-none bg-transparent font-mono text-[length:var(--fs-base)] text-text-100 outline-none placeholder:text-text-400"
          />
          {isLoading ? <span className="text-xs text-text-400">Loading...</span> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar">
        {error ? <div className="flex h-full items-center justify-center px-4 text-center text-[length:var(--fs-sm)] text-danger-100">{error}</div> : null}

        {!error && (
          <div className="space-y-0.5">
            <button onClick={goUp} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-text-400 transition hover:bg-bg-100 hover:text-text-200">
              <span className="text-xs">..</span>
              <span>（上级目录）</span>
            </button>

            {items.map((item, index) => (
              <button
                key={item.path}
                onClick={() => setInputValue(item.path)}
                onDoubleClick={() => {
                  onSelect(item.path)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition ${selectedIndex === index ? 'bg-bg-100/80 ring-1 ring-border-200/50' : 'hover:bg-bg-100/50'}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FolderIcon className="h-4 w-4 shrink-0 text-accent-main-100" />
                  <span className="truncate text-[length:var(--fs-base)] text-text-200">{item.name}</span>
                </div>
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    onSelect(item.path)
                    onClose()
                  }}
                  className="rounded-lg bg-accent-main-100 px-3 py-1.5 text-[length:var(--fs-sm)] font-medium text-black transition hover:brightness-95"
                >
                  + 添加
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border-200/40 px-4 py-3">
        <div className="truncate font-mono text-[length:var(--fs-xs)] text-text-400">{currentDir}</div>
        <button
          type="button"
          onClick={() => {
            onSelect(inputValue)
            onClose()
          }}
          className="rounded-xl border border-border-200/60 px-4 py-2 text-[length:var(--fs-sm)] text-text-200 transition hover:border-border-300 hover:bg-bg-100"
        >
          <span className="inline-flex items-center gap-2">
            <PlusIcon className="h-3.5 w-3.5" />
            添加当前目录
          </span>
        </button>
      </div>
    </Dialog>
  )
}

export function KtProjectPicker({
  currentWorkspace,
  onChange,
}: {
  currentWorkspace: string | null
  onChange: (workspace: string | null) => void
}) {
  const [projects, setProjects] = useState<KtProjectLike[]>(() => {
    const saved = loadSavedProjects()
    return [{ id: 'global', name: '全局', worktree: '' }, ...saved]
  })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<KtProjectLike | null>(null)

  useEffect(() => {
    const saved = loadSavedProjects()
    setProjects([{ id: 'global', name: '全局', worktree: '' }, ...saved])
  }, [])

  const currentProject = useMemo(() => {
    if (!currentWorkspace) return projects[0] ?? { id: 'global', name: '全局', worktree: '' }
    return projects.find(project => isSameDirectory(project.worktree, currentWorkspace)) ?? makeProject(currentWorkspace)
  }, [currentWorkspace, projects])

  const sortedProjects = useMemo(() => {
    const recent = serverStorage.getJSON<Record<string, number>>(STORAGE_KEY_RECENT) ?? {}
    return [...projects].sort((a, b) => {
      if (a.id === 'global') return -1
      if (b.id === 'global') return 1
      return (recent[b.worktree] ?? 0) - (recent[a.worktree] ?? 0)
    })
  }, [projects])

  const otherProjects = sortedProjects.filter(project => project.id !== currentProject.id)

  const addProject = useCallback(
    (path: string) => {
      const normalized = normalizeToForwardSlash(path)
      if (!normalized) return

      setProjects(prev => {
        if (prev.some(project => isSameDirectory(project.worktree, normalized))) {
          return prev
        }
        const next = [...prev, makeProject(normalized)]
        persistProjects(next)
        return next
      })
      touchRecent(normalized)
      onChange(normalized)
    },
    [onChange],
  )

  const removeProject = useCallback(
    (projectId: string) => {
      setProjects(prev => {
        const next = prev.filter(project => project.id !== projectId)
        persistProjects(next)
        return next
      })
      if (currentProject.id === projectId) {
        onChange(null)
      }
    },
    [currentProject.id, onChange],
  )

  return (
    <>
      <div className="glass rounded-2xl border border-border-200/60 p-3">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <div className="text-[length:var(--fs-xs)] font-semibold uppercase tracking-wider text-text-400">Workspace</div>
        </div>

        <div className="w-full rounded-xl bg-bg-100/50 p-1">
          <button
            type="button"
            title={currentProject.worktree || 'All workspaces'}
            className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-200/60"
          >
            {currentProject.id === 'global' ? <GlobeIcon className="h-4 w-4 text-accent-main-100" /> : <FolderIcon className="h-4 w-4 text-text-300" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--fs-base)] font-semibold text-text-100">{currentProject.name}</div>
              <div className="truncate font-mono text-[length:var(--fs-xxs)] text-text-400/70">{currentProject.id === 'global' ? 'All workspaces' : currentProject.worktree}</div>
            </div>
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border-200/50">
          {otherProjects.length === 0 ? (
            <div className="px-4 py-4 text-[length:var(--fs-sm)] text-text-400">No other workspaces yet.</div>
          ) : (
            otherProjects.map(project => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  touchRecent(project.worktree)
                  onChange(project.id === 'global' ? null : project.worktree)
                }}
                className="group flex w-full items-center gap-2.5 border-b border-border-200/30 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-100/60"
              >
                {project.id === 'global' ? <GlobeIcon className="h-4 w-4 text-accent-main-100" /> : <FolderIcon className="h-4 w-4 text-text-400" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[length:var(--fs-base)] text-text-200">{project.name}</div>
                  <div className="truncate font-mono text-[length:var(--fs-xxs)] text-text-400/60">{project.id === 'global' ? 'All workspaces' : project.worktree}</div>
                </div>
                {project.id !== 'global' && (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation()
                      setConfirmRemove(project)
                    }}
                    className="rounded-md p-1 text-text-400 transition hover:bg-danger-100/10 hover:text-danger-100 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            ))
          )}

          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="flex w-full items-center gap-2 px-3 py-3 text-left text-[length:var(--fs-sm)] text-text-300 transition hover:bg-bg-100/60 hover:text-text-100"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            添加项目...
          </button>
        </div>
      </div>

      <ProjectDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSelect={addProject}
        initialPath={currentWorkspace || getHomeCandidates()[0]}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) removeProject(confirmRemove.id)
          setConfirmRemove(null)
        }}
        title="移除项目"
        description={`确认移除 ${confirmRemove?.name ?? ''} 吗？`}
        confirmText="移除"
        variant="danger"
      />
    </>
  )
}
