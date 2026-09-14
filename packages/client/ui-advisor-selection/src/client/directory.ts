/** Global advisor choices derived on demand from settings and the Host model catalog. */
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** One plugin's stateless directory; each operation reads the current Host generation. */
export class AdvisorDirectory {
  constructor(
    private readonly remote: Pick<TypertClientRemote, 'settings' | 'session'>,
    private readonly t: TranslateNS<'advisor'>,
  ) {}

  private async settings() {
    const result = await this.remote.settings.describe()
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    const descriptor = result.value.namespaces.find(namespace => namespace.ns === 'advisor')
    if (descriptor === undefined) throw new Error(this.t('error.unavailableSettings'))
    if (!result.value.writable) throw new Error(this.t('error.readOnly'))
    return descriptor
  }

  private async load() {
    const [descriptor, result] = await Promise.all([this.settings(), this.remote.session.modelCatalog()])
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return { descriptor, catalog: result.value }
  }

  /**
   * Read global enablement and the saved route, then list provider-grouped catalog models.
   * @returns localized Off followed by advertised models, with the current choice marked active.
   */
  async options(): Promise<SelectOption[]> {
    const { descriptor, catalog } = await this.load()
    const value = descriptor.value
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(this.t('error.unavailableSettings'))
    }
    const enabled = value.enabled !== false
    return [
      { id: 'off', label: this.t('option.off'), active: !enabled },
      ...catalog.groups.flatMap(group => group.models.map(model => ({
        id: `${group.id}/${model.id}`,
        label: model.name,
        detail: group.name,
        active: enabled && value.provider === group.id && value.model === model.id,
      }))),
    ]
  }

  /**
   * Resolve an opaque route id against a fresh catalog and persist the global choice.
   * @param id - Off or a provider/model row id from the popup.
   * @returns settled after the revision-checked write; failures reject for popup retry.
   */
  async select(id: string): Promise<void> {
    if (id === 'off') {
      const descriptor = await this.settings()
      const result = await this.remote.settings.update('advisor', { enabled: false }, descriptor.revision)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return
    }
    const { descriptor, catalog } = await this.load()
    for (const group of catalog.groups) {
      for (const model of group.models) {
        if (`${group.id}/${model.id}` !== id) continue
        const effort = model.reasoning?.defaultEffort
        const result = effort === undefined
          ? await this.remote.settings.mutate('advisor', [
            { op: 'set', path: ['enabled'], value: true },
            { op: 'set', path: ['provider'], value: group.id },
            { op: 'set', path: ['model'], value: model.id },
            { op: 'unset', path: ['reasoningEffort'] },
          ], descriptor.revision)
          : await this.remote.settings.update('advisor', {
            enabled: true, provider: group.id, model: model.id, reasoningEffort: effort,
          }, descriptor.revision)
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
        return
      }
    }
    throw new Error(this.t('error.unavailableModel'))
  }
}
