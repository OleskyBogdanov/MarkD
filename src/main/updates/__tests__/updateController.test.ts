import { expect, test, vi } from 'vitest';
import { UpdateController } from '../updateController.js';
const setup = (enabled = true) => {
  const actions = { check: vi.fn(async () => {}), download: vi.fn(async () => {}), prepare: vi.fn(async () => true), install: vi.fn(), resume: vi.fn(), publish: vi.fn() };
  return { actions, controller: new UpdateController('0.4.0', enabled, actions) };
};
test('development/local packages do not contact a feed', async () => {
  const { controller, actions } = setup(false);
  await controller.run('check');
  expect(actions.check).not.toHaveBeenCalled();
});
test('cancelled document close never installs or loses downloaded state', async () => {
  const { controller, actions } = setup();
  controller.set({ status: 'downloaded' });
  actions.prepare.mockResolvedValue(false);
  await controller.run('install');
  expect(actions.install).not.toHaveBeenCalled();
  expect(controller.state.status).toBe('downloaded');
});
test('install errors resume the document', async () => {
  const { controller, actions } = setup();
  controller.set({ status: 'downloaded' });
  actions.install.mockImplementation(() => { throw new Error('signature rejected'); });
  await controller.run('install');
  expect(controller.state.status).toBe('error');
  expect(actions.resume).toHaveBeenCalledOnce();
});
test('concurrent checks coalesce and network failures remain recoverable', async () => {
  const { controller, actions } = setup();
  let reject!: (reason: Error) => void;
  actions.check.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  const first = controller.run('check');
  const second = controller.run('check');
  expect(actions.check).toHaveBeenCalledOnce();
  reject(new Error('offline'));
  await Promise.all([first, second]);
  expect(controller.state.status).toBe('error');
});
