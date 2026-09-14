/** Typed copy for the global advisor command. */

/** Simplified Chinese dictionary and key source. */
export const zh = {
  'command.label': '顾问',
  'command.description': '为所有会话选择顾问模型或关闭顾问',
  'option.off': '关闭',
  'error.unavailableModel': '所选顾问模型不可用，请重新加载列表。',
  'error.unavailableSettings': '顾问设置不可用。',
  'error.readOnly': '顾问设置为只读。',
} satisfies Record<string, string>

/** Advisor dictionary keys. */
export type AdvisorKey = keyof typeof zh

/** English dictionary, complete against the Chinese keys. */
export const en = {
  'command.label': 'Advisor',
  'command.description': 'Select an advisor model or turn it off for all conversations',
  'option.off': 'Off',
  'error.unavailableModel': 'The selected advisor model is unavailable; reload the list.',
  'error.unavailableSettings': 'Advisor settings are unavailable.',
  'error.readOnly': 'Advisor settings are read-only.',
} satisfies Record<AdvisorKey, string>
