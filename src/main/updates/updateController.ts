import type { UpdateState } from '../../shared/ipc-channels.js';

type UpdateActions = {
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  prepare: () => Promise<boolean>;
  install: () => void;
  resume: () => void;
  publish: (state: UpdateState) => void;
};

export class UpdateController {
  state: UpdateState;
  private pending: Promise<void> | null = null;
  constructor(version: string, enabled: boolean, private readonly actions: UpdateActions) {
    this.state = { status: enabled ? 'idle' : 'disabled', currentVersion: version };
  }
  set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.actions.publish(this.state);
  }
  fail(error: unknown): void {
    const wasInstalling = this.state.status === 'installing';
    this.set({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось обновить приложение.' });
    if (wasInstalling) this.actions.resume();
  }
  run(command: 'check' | 'download' | 'install'): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state.status === 'disabled' || this.state.status === 'installing') return Promise.resolve();
    if (command === 'check' && ['available', 'downloading', 'downloaded'].includes(this.state.status)) return Promise.resolve();
    if (command === 'download' && this.state.status !== 'available') return Promise.resolve();
    if (command === 'install' && this.state.status !== 'downloaded') return Promise.resolve();
    const task = (async () => {
      try {
        if (command === 'check') { this.set({ status: 'checking', message: undefined }); await this.actions.check(); }
        if (command === 'download') { this.set({ status: 'downloading', percent: 0, message: undefined }); await this.actions.download(); }
        if (command === 'install') {
          if (!await this.actions.prepare()) return;
          if (this.state.status !== 'downloaded') { this.actions.resume(); return; }
          this.set({ status: 'installing' });
          this.actions.install();
        }
      } catch (error) { this.fail(error); }
    })();
    this.pending = task;
    void task.finally(() => { this.pending = null; });
    return task;
  }
}
