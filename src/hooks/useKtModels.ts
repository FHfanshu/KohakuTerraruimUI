import { useCallback, useEffect, useState } from 'react'

import type { ModelInfo } from '../api'
import { ktListModels, ktSaveProfile, ktSwitchModel, type KtModelEntry } from '../api/ktClient'

function mapKtModel(model: KtModelEntry): ModelInfo {
  const defaultVariant = model.reasoning_effort || inferReasoningVariant(model.extra_body)
  return {
    id: model.name,
    name: model.name,
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
    variants: model.available ? buildReasoningVariants(defaultVariant) : [],
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
  const variants = ['minimal', 'low', 'medium', 'high']
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
  const [models, setModels] = useState<ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [optimisticModel, setOptimisticModel] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const items = await ktListModels()
      const availableItems = items.filter(item => item.available)
      setRawModels(availableItems)
      setModels(availableItems.map(mapKtModel))
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
  const selectedModelEntry = activeModelName
    ? rawModels.find(model => model.name === activeModelName) ?? null
    : null
  const selectedModel = activeModelName
    ? models.find(model => model.id === activeModelName || model.name === activeModelName) ?? null
    : null
  const selectedModelKey = selectedModel ? `${selectedModel.providerId}:${selectedModel.id}` : null

  useEffect(() => {
    if (!selectedModelEntry) return
    const variant = selectedModelEntry.reasoning_effort || inferReasoningVariant(selectedModelEntry.extra_body)
    setSelectedVariant(variant || undefined)
  }, [selectedModelEntry])

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
    [agentId, onSwitched, selectedModel, selectedModelEntry],
  )

  return {
    models,
    isLoading,
    error,
    refresh,
    selectedModelKey,
    selectedVariant,
    switchModel,
    switchVariant,
  }
}
