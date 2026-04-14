import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModelInfo } from '../api'
import { ktListModels, ktSaveProfile, ktSwitchModel, type KtModelEntry } from '../api/ktClient'

function mapKtModel(model: KtModelEntry, displayName?: string): ModelInfo {
  const defaultVariant = model.reasoning_effort || inferReasoningVariant(model.extra_body)
  return {
    id: model.name,
    name: displayName || model.name,
    providerId: model.provider || model.login_provider || 'kt',
    providerName: model.provider || model.login_provider || 'KT',
    family: model.source || 'kt',
    contextLimit: model.max_context || 0,
    outputLimit: model.max_output || 0,
    supportsReasoning: Boolean(model.reasoning_effort),
    supportsImages: false,
    supportsPdf: false,
    supportsAudio: false,
    supportsVideo: false,
    supportsToolcall: true,
    variants: defaultVariant ? buildReasoningVariants(defaultVariant) : [],
  }
}

function inferReasoningVariant(extraBody: Record<string, unknown>): string {
  const reasoning = extraBody.reasoning
  if (typeof reasoning === 'object' && reasoning && 'effort' in reasoning) {
    const effort = (reasoning as { effort?: unknown }).effort
    if (typeof effort === 'string') return effort
  }
  return ''
}

function buildReasoningVariants(defaultVariant: string): string[] {
  const variants = ['minimal', 'low', 'medium', 'high', 'xhigh']
  if (defaultVariant && !variants.includes(defaultVariant)) {
    variants.unshift(defaultVariant)
  }
  return variants
}

interface UseKtModelsOptions {
  agentId: string | null
  currentModel: string | null
  onSwitched?: (modelName: string) => void
}

export function useKtModels({ agentId, currentModel, onSwitched }: UseKtModelsOptions) {
  const [rawModels, setRawModels] = useState<KtModelEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimisticModel, setOptimisticModel] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const items = await ktListModels()
      setRawModels(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KT models')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setOptimisticModel(null)
  }, [currentModel])

  const activeModelName = optimisticModel ?? currentModel
  const visibleModels = useMemo(() => {
    const userModels = rawModels.filter(item => item.source === 'user')
    const presetModels = rawModels.filter(item => item.source !== 'user')
    return [...userModels, ...presetModels]
  }, [rawModels])

  const exactEntry = useMemo(() => {
    if (!activeModelName) return null
    return rawModels.find(model => model.name === activeModelName) ?? null
  }, [activeModelName, rawModels])

  const modelMatches = useMemo(() => {
    if (!currentModel) return []
    return rawModels.filter(model => model.model === currentModel || model.name === currentModel)
  }, [currentModel, rawModels])

  const selectedModelEntry = useMemo(() => {
    if (exactEntry) return exactEntry
    if (!currentModel) return null

    const exactModelName = modelMatches.find(model => model.name === currentModel)
    if (exactModelName) return exactModelName

    if (modelMatches.length === 1) return modelMatches[0]

    const preferred =
      modelMatches.find(model => model.name === currentModel) ??
      modelMatches.find(model => model.is_default) ??
      modelMatches.find(model => model.name === model.model)
    return preferred ?? modelMatches[0] ?? null
  }, [currentModel, exactEntry, modelMatches])

  const canSwitchVariant = useMemo(() => {
    if (!agentId || !selectedModelEntry) return false
    if (exactEntry) return true
    if (!currentModel) return false
    return modelMatches.length === 1 || modelMatches.some(model => model.name === currentModel)
  }, [agentId, currentModel, exactEntry, modelMatches, selectedModelEntry])

  const selectedDisplayModel = useMemo(() => {
    if (!activeModelName) return null

    if (selectedModelEntry) {
      return mapKtModel(selectedModelEntry, currentModel || selectedModelEntry.model || activeModelName)
    }

    return {
      id: activeModelName,
      name: currentModel || activeModelName,
      providerId: 'kt',
      providerName: 'KT',
      family: 'kt',
      contextLimit: 0,
      outputLimit: 0,
      supportsReasoning: false,
      supportsImages: false,
      supportsPdf: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsToolcall: true,
      variants: [],
    }
  }, [activeModelName, currentModel, selectedModelEntry])

  const models = useMemo(() => {
    const base = visibleModels.map(model => mapKtModel(model))
    if (!selectedDisplayModel) return base
    if (base.some(model => model.id === selectedDisplayModel.id)) return base
    return [selectedDisplayModel, ...base]
  }, [selectedDisplayModel, visibleModels])

  const selectedModel = selectedDisplayModel
  const selectedModelKey = selectedDisplayModel ? `${selectedDisplayModel.providerId}:${selectedDisplayModel.id}` : null

  useEffect(() => {
    if (!selectedModelEntry || !canSwitchVariant) {
      setSelectedVariant(undefined)
      return
    }
    const variant = selectedModelEntry.reasoning_effort || inferReasoningVariant(selectedModelEntry.extra_body)
    setSelectedVariant(variant || undefined)
  }, [canSwitchVariant, selectedModelEntry])

  const switchModel = useCallback(
    async (modelKey: string, model: ModelInfo) => {
      if (!agentId) {
        throw new Error('No active KT agent')
      }
      const nextModel = model.id || model.name
      setOptimisticModel(nextModel)
      await ktSwitchModel(agentId, nextModel)
      onSwitched?.(nextModel)
      return { modelKey, model }
    },
    [agentId, onSwitched],
  )

  const switchVariant = useCallback(
    async (variant: string | undefined) => {
      if (!agentId || !selectedModel) {
        return
      }
      if (!canSwitchVariant) {
        return
      }
      if (!variant) {
        setSelectedVariant(undefined)
        return
      }

      const baseProfileName = selectedModelEntry?.name || selectedModel.id
      const baseModelId = selectedModelEntry?.model || selectedModel.id
      const profileName = `${baseProfileName}__${variant}`
      await ktSaveProfile({
        name: profileName,
        model: baseModelId,
        provider: selectedModelEntry?.provider || selectedModel.providerId,
        base_url: selectedModelEntry?.base_url,
        max_context: selectedModelEntry?.max_context || selectedModel.contextLimit,
        max_output: selectedModelEntry?.max_output || selectedModel.outputLimit,
        temperature: selectedModelEntry?.temperature,
        reasoning_effort: variant,
        extra_body: selectedModelEntry?.extra_body,
      })
      await ktSwitchModel(agentId, profileName)
      setOptimisticModel(profileName)
      setSelectedVariant(variant)
      onSwitched?.(profileName)
    },
    [agentId, canSwitchVariant, onSwitched, selectedModel, selectedModelEntry],
  )

  return {
    models,
    isLoading,
    error,
    refresh,
    selectedModelKey,
    selectedVariant,
    canSwitchVariant,
    switchModel,
    switchVariant,
  }
}
