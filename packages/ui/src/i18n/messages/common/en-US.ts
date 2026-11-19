/**
 * Common messages — English (L1).
 *
 * Key spec: <domain>.<section>.<element>[.<state>]
 * Source: packages/conventions/i18n/key-patterns.json
 */

export const enUS = {
  'common.action.confirm': 'Confirm',
  'common.action.cancel': 'Cancel',
  'common.action.save': 'Save',
  'common.action.delete': 'Delete',
  'common.action.edit': 'Edit',
  'common.action.create': 'Create',
  'common.action.close': 'Close',
  'common.action.back': 'Back',
  'common.action.retry': 'Retry',
  'common.action.search': 'Search',
  'common.action.reset': 'Reset',
  'common.action.copy': 'Copy',
  'common.action.download': 'Download',
  'common.action.upload': 'Upload',
  'common.action.export': 'Export',
  'common.action.import': 'Import',
  'common.action.refresh': 'Refresh',
  'common.action.more': 'More',

  'common.state.loading': 'Loading…',
  'common.state.empty': 'No data',
  'common.state.success': 'Success',
  'common.state.error': 'Failed',

  'common.error.network': 'Network error. Check your connection and try again.',
  'common.error.server': 'Service temporarily unavailable. Please try again later.',
  'common.error.unauthorized': 'Your session has expired. Please sign in again.',
  'common.error.forbidden': 'You do not have permission to do this.',
  'common.error.notFound': 'The requested resource was not found.',
  'common.error.conflict': 'This conflicts with the current state. Please refresh and retry.',
  'common.error.rateLimited': 'Too many requests. Please try again later.',
  'common.error.unknown': 'An unknown error occurred.',

  'common.empty.title': 'Nothing here yet',
  'common.empty.hint': 'There is no data to display',
  'common.empty.action': 'Create the first one',

  'common.label.all': 'All',
  'common.label.more': 'See more',
  'common.label.total': '{count} total',
  'common.label.required': 'Required',
  'common.label.optional': 'Optional',

  'theme.preset.scholar.label': 'Scholar Purple',
  'theme.preset.scholar.description': 'Calm and reserved, continues the existing brand color',
  'theme.preset.academic.label': 'Academic Blue',
  'theme.preset.academic.description': 'Formal and universal, common in international journals',
  'theme.preset.emerald.label': 'Emerald',
  'theme.preset.emerald.description': 'Easy on the eyes, Nature journal style',
  'theme.preset.graphite.label': 'Graphite',
  'theme.preset.graphite.description': 'Minimal and neutral, print friendly',
  'theme.preset.lab.label': 'Lab Orange',
  'theme.preset.lab.description': 'Vivid and striking, good for presentations',

  'theme.label.mode': 'Theme mode',
  'theme.label.density': 'Density',
  'theme.label.primary': 'Brand color',
  'theme.label.radius': 'Corner radius',
  'theme.label.brand': 'Brand',

  'theme.mode.light': 'Light',
  'theme.mode.dark': 'Dark',
  'theme.mode.auto': 'Follow system',

  'theme.density.default': 'Default',
  'theme.density.compact': 'Compact',

  'i18n.label.language': 'Language',
} as const;
