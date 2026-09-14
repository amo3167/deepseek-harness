/** Global /advisor contribution over the settings Remote and shared model catalog. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import { AdvisorDirectory } from './directory.ts'
import { en, zh, type AdvisorKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Global advisor picker copy. */
    advisor: AdvisorKey
  }
}

/** Command registration, localization, and the existing global Host APIs. */
export const inject = ['commandUi', 'locale', 'remote', 'remote.settings', 'remote.session']

/**
 * Register the global advisor picker and its dictionaries as disposable effects.
 * @param ctx - browser root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('advisor', { en, zh }), 'ui-advisor-selection: dictionaries')
  const t = ctx.locale.bind('advisor')
  const directory = new AdvisorDirectory(ctx.remote, t)
  ctx.effect(() => ctx.commandUi.register({
    name: 'advisor',
    label: () => t('command.label'),
    description: () => t('command.description'),
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: () => directory.options(),
      onSelect: option => directory.select(option.id),
    },
  }), 'ui-advisor-selection: /advisor contribution')
}
