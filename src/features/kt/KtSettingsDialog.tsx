import { useCallback, useEffect, useMemo, useState } from 'react'

import { CloseIcon, CogIcon, GlobeIcon, KeyboardIcon, PlugIcon, SunIcon } from '../../components/Icons'
import { Dialog } from '../../components/ui/Dialog'
import { useIsMobile } from '../../hooks'
import {
  ktGetDefaultModel,
  ktListMcpServers,
  ktListModels,
  ktRemoveMcpServer,
  ktSaveMcpServer,
  ktSetDefaultModel,
  type KtMcpServer,
  type KtModelEntry,
} from '../../api/ktClient'
import { KeybindingsSection } from '../settings/KeybindingsSection'
import { AppearanceSettings } from '../settings/components/AppearanceSettings'
import { ChatSettings } from '../settings/components/ChatSettings'
import { SettingsCard } from '../settings/components/SettingsUI'

type KtSettingsTab = 'appearance' | 'chat' | 'models' | 'mcp' | 'keybindings'

interface KtSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: KtSettingsTab
}

const TAB_META: Array<{ id: KtSettingsTab; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'models', label: 'KT Models', description: 'Default model and reasoning presets for KT agents.', icon: <GlobeIcon size={15} /> },
  { id: 'mcp', label: 'MCP', description: 'Global MCP server configuration used by KT.', icon: <PlugIcon size={15} /> },
  { id: 'chat', label: 'Chat', description: 'KT chat behavior and interaction preferences.', icon: <CogIcon size={15} /> },
  { id: 'appearance', label: 'Appearance', description: 'Theme, glass effect, typography, and layout.', icon: <SunIcon size={15} /> },
  { id: 'keybindings', label: 'Shortcuts', description: 'Keyboard shortcuts for the KT UI.', icon: <KeyboardIcon size={15} /> },
]

function KtModelsSettings() {
  const [models, setModels] = useState<KtModelEntry[]>([])
  const [defaultModel, setDefaultModelState] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [modelList, currentDefault] = await Promise.all([ktListModels(), ktGetDefaultModel()])
      setModels(modelList)
      setDefaultModelState(currentDefault.default_model)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KT model settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const availableModels = useMemo(() => models.filter(model => model.available), [models])

  return (
    <div className="space-y-4">
      <SettingsCard title="Default model" description="New KT agents will use this profile unless a config overrides it.">
        <div className="space-y-2">
          <select
            value={defaultModel}
            onChange={event => {
              const next = event.target.value
              setDefaultModelState(next)
              void ktSetDefaultModel(next).catch(err => {
                setError(err instanceof Error ? err.message : 'Failed to set default model')
              })
            }}
            className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none"
          >
            {availableModels.map(model => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
          <div className="text-[length:var(--fs-xs)] text-text-400">Reasoning effort variants will appear in the chat input when the selected model supports them.</div>
        </div>
      </SettingsCard>

      <SettingsCard title="Available KT model profiles" description="Profiles discovered from KT presets and your custom model definitions.">
        <div className="space-y-2">
          {isLoading ? <div className="text-[length:var(--fs-sm)] text-text-400">Loading models...</div> : null}
          {availableModels.map(model => (
            <div key={model.name} className="rounded-lg border border-border-200/50 bg-bg-100/35 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[length:var(--fs-md)] font-medium text-text-100">{model.name}</div>
                  <div className="text-[length:var(--fs-xs)] text-text-400">
                    {model.provider} · ctx {model.max_context || 0} · out {model.max_output || 0}
                  </div>
                </div>
                {model.is_default && <span className="rounded-full bg-accent-main-100/10 px-2 py-0.5 text-[length:var(--fs-xxs)] text-accent-main-100">default</span>}
              </div>
            </div>
          ))}
          {error ? <div className="text-[length:var(--fs-xs)] text-danger-100">{error}</div> : null}
        </div>
      </SettingsCard>
    </div>
  )
}

function KtMcpSettings() {
  const [servers, setServers] = useState<KtMcpServer[]>([])
  const [draft, setDraft] = useState<KtMcpServer>({
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    env: {},
    url: '',
  })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await ktListMcpServers()
      setServers(result.servers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-4">
      <SettingsCard title="Global MCP servers" description="These servers are injected into KT agent startup globally.">
        <div className="space-y-2">
          {servers.length === 0 ? <div className="text-[length:var(--fs-sm)] text-text-400">No MCP servers configured.</div> : null}
          {servers.map(server => (
            <div key={server.name} className="flex items-center justify-between gap-3 rounded-lg border border-border-200/50 bg-bg-100/35 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[length:var(--fs-md)] font-medium text-text-100">{server.name}</div>
                <div className="truncate text-[length:var(--fs-xs)] text-text-400">
                  {server.transport} · {server.command || server.url || 'configured'}
                </div>
              </div>
              <button
                onClick={() => void ktRemoveMcpServer(server.name).then(refresh)}
                className="rounded-md border border-border-200/60 px-2 py-1 text-[length:var(--fs-xs)] text-text-300 transition hover:border-danger-100/50 hover:text-danger-100"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Add MCP server" description="Use this only for servers you want every KT agent to try on startup.">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-[length:var(--fs-xs)] text-text-400">
            <span>Name</span>
            <input value={draft.name} onChange={event => setDraft(prev => ({ ...prev, name: event.target.value }))} className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none" />
          </label>
          <label className="space-y-1 text-[length:var(--fs-xs)] text-text-400">
            <span>Transport</span>
            <select value={draft.transport} onChange={event => setDraft(prev => ({ ...prev, transport: event.target.value }))} className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none">
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>
          <label className="space-y-1 text-[length:var(--fs-xs)] text-text-400">
            <span>Command</span>
            <input value={draft.command} onChange={event => setDraft(prev => ({ ...prev, command: event.target.value }))} className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none" />
          </label>
          <label className="space-y-1 text-[length:var(--fs-xs)] text-text-400">
            <span>URL</span>
            <input value={draft.url} onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))} className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none" />
          </label>
          <label className="space-y-1 text-[length:var(--fs-xs)] text-text-400 md:col-span-2">
            <span>Args (space separated)</span>
            <input
              value={draft.args.join(' ')}
              onChange={event => setDraft(prev => ({ ...prev, args: event.target.value.trim() ? event.target.value.trim().split(/\s+/) : [] }))}
              className="h-10 w-full rounded-lg border border-border-200 bg-bg-200/50 px-3 text-text-100 focus:border-accent-main-100/50 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {error ? <div className="text-[length:var(--fs-xs)] text-danger-100">{error}</div> : <div className="text-[length:var(--fs-xs)] text-text-400">Prefer leaving this empty unless you really need MCP.</div>}
          <button
            onClick={() =>
              void ktSaveMcpServer(draft)
                .then(() => {
                  setDraft({ name: '', transport: 'stdio', command: '', args: [], env: {}, url: '' })
                  return refresh()
                })
                .catch(err => setError(err instanceof Error ? err.message : 'Failed to save MCP server'))
            }
            className="rounded-lg bg-accent-main-100 px-3 py-2 text-[length:var(--fs-sm)] font-medium text-black transition hover:brightness-95"
          >
            Save MCP server
          </button>
        </div>
      </SettingsCard>
    </div>
  )
}

function KtTabContent({ tab }: { tab: KtSettingsTab }) {
  switch (tab) {
    case 'appearance':
      return <AppearanceSettings />
    case 'chat':
      return <ChatSettings />
    case 'models':
      return <KtModelsSettings />
    case 'mcp':
      return <KtMcpSettings />
    case 'keybindings':
      return <KeybindingsSection />
    default:
      return null
  }
}

export function KtSettingsDialog({ isOpen, onClose, initialTab = 'models' }: KtSettingsDialogProps) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<KtSettingsTab>(initialTab)
  const activeTab = useMemo(() => TAB_META.find(item => item.id === tab) ?? TAB_META[0], [tab])

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab)
    }
  }, [initialTab, isOpen])

  if (isMobile) {
    return (
      <Dialog isOpen={isOpen} onClose={onClose} title="" width="100%" showCloseButton={false} rawContent>
        <div className="flex h-[92vh] flex-col">
          <div className="shrink-0 border-b border-border-100/40 px-4 pb-3 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[length:var(--fs-heading-3)] font-semibold text-text-100">KT Settings</div>
                <div className="mt-0.5 text-[length:var(--fs-xs)] text-text-400">Configure KohakuTerrarium UI and KT runtime defaults.</div>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-text-400 transition hover:bg-bg-100 hover:text-text-200">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none">
              {TAB_META.map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[length:var(--fs-sm)] transition ${item.id === tab ? 'border-accent-main-100/30 bg-accent-main-100/10 text-accent-main-100' : 'border-transparent text-text-400 hover:bg-bg-100/60'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <KtTabContent tab={tab} />
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="" width="min(94vw, 980px)" showCloseButton={false} rawContent>
      <div className="flex h-[min(88vh,780px)]">
        <nav className="flex w-[224px] shrink-0 flex-col border-r border-border-100/60 px-2.5 py-4">
          <div className="mb-4 px-3">
            <div className="text-[length:var(--fs-base)] font-semibold text-text-100">KT Settings</div>
            <div className="mt-0.5 text-[length:var(--fs-xs)] leading-relaxed text-text-400">OpenCodeUI shell settings adapted for KohakuTerrarium.</div>
          </div>
          <div className="space-y-1">
            {TAB_META.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[length:var(--fs-md)] transition ${item.id === tab ? 'bg-bg-100 text-text-100 ring-1 ring-border-200/60' : 'text-text-400 hover:bg-bg-100/50 hover:text-text-200'}`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-100/60 px-6 py-3.5">
            <div className="min-w-0">
              <div className="text-[length:var(--fs-heading-3)] font-semibold text-text-100">{activeTab.label}</div>
              <div className="mt-0.5 truncate text-[length:var(--fs-xs)] text-text-400">{activeTab.description}</div>
            </div>
            <button onClick={onClose} className="rounded-md p-2 text-text-400 transition hover:bg-bg-100 hover:text-text-200">
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
            <KtTabContent tab={tab} />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
