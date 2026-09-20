import type { DesktopApi } from '@/shared/ipc-channels';
declare global {
  interface Window { desktop: DesktopApi }
}
export {};
