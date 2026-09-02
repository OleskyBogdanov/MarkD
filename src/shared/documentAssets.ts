export const FONT_IDS = [
  'golos-text',
  'inter',
  'roboto',
  'open-sans',
  'montserrat',
  'manrope',
  'pt-sans',
  'noto-sans',
  'source-sans-3',
  'rubik',
  'pt-serif',
  'noto-serif',
  'source-serif-4',
  'merriweather',
  'roboto-slab',
  'lora',
  'playfair-display',
  'literata',
  'jetbrains-mono',
  'roboto-mono'
] as const;

export const DEFAULT_FONT_ID = 'inter' as const;

export const ICON_NAMES = [
  'user', 'users', 'contact', 'phone', 'smartphone', 'mail', 'at-sign', 'map-pin', 'globe', 'link',
  'briefcase', 'building', 'store', 'factory', 'landmark', 'badge', 'award', 'handshake', 'presentation', 'calendar',
  'file-text', 'folder', 'clipboard', 'list', 'table', 'clock', 'info', 'help', 'alert', 'check',
  'wallet', 'credit-card', 'banknote', 'receipt', 'percent', 'calculator', 'chart-bar', 'chart-line', 'trending-up', 'coins',
  'shopping-cart', 'shopping-bag', 'package', 'boxes', 'truck', 'plane', 'ship', 'warehouse', 'route', 'navigation',
  'message', 'send', 'bell', 'megaphone', 'headset', 'star', 'heart', 'flag', 'target', 'tag', 'hash'
] as const;

export type FontId = (typeof FONT_IDS)[number];
export type DocumentIconName = (typeof ICON_NAMES)[number];
