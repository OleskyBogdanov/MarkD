import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ok } from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright';

// Hidden native windows cannot reliably receive compositor input on Windows CI.
const hiddenTestWindow = !(process.env.CI && process.platform === 'win32');

let app: ElectronApplication;
let page: Page;
let directory: string;

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-editor-layout-'));
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MARKD_USER_DATA_DIR: join(directory, 'profile'),
      MARKD_E2E_HEADLESS: hiddenTestWindow ? '1' : '0'
    }
  });
  page = await app.firstWindow();
  await page.clock.install();
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await expect(page.getByTestId('editor-page')).toHaveCount(1);
});

test.afterEach(async () => {
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app?.close().catch(() => {});
  rmSync(directory, { recursive: true, force: true });
});

const footer = (): Locator => page.getByLabel('Нижняя панель документа', { exact: true });
const pageAction = async (name: string): Promise<void> => {
  await footer().getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
};

test('page actions preserve pending text, move the selected page and protect the last page', async () => {
  const pages = page.getByTestId('editor-page');
  const selector = footer().getByRole('combobox', { name: 'Текущая страница', exact: true });
  const trigger = footer().getByRole('button', { name: 'Действия со страницей', exact: true });
  const duplicate = page.getByRole('menuitem', { name: 'Дублировать страницу', exact: true });
  const above = page.getByRole('menuitem', { name: 'Выше', exact: true });
  const below = page.getByRole('menuitem', { name: 'Ниже', exact: true });
  const remove = page.getByRole('menuitem', { name: 'Удалить страницу', exact: true });
  const originalId = await selector.inputValue();
  await expect(pages.first()).toHaveAttribute('data-page-id', originalId);

  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(duplicate).toBeFocused();
  await expect(above).toBeDisabled();
  await expect(below).toBeDisabled();
  await expect(remove).toBeDisabled();
  await duplicate.press('End');
  await expect(duplicate).toBeFocused();
  await duplicate.press('ArrowDown');
  await expect(duplicate).toBeFocused();
  await duplicate.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(duplicate).toHaveCount(0);
  await trigger.press('ArrowDown');
  await duplicate.press('Tab');
  await expect(duplicate).toHaveCount(0);
  await expect(trigger).not.toBeFocused();
  await expect(footer().locator(':focus')).toHaveCount(1);
  await expect(pages).toHaveCount(1);

  // Do not blur first: duplication must include edits still pending in the field.
  await pages.first().getByRole('textbox', { name: 'Текст на странице', exact: true }).first().fill('Original pending text');
  await pageAction('Дублировать страницу');
  await expect(pages).toHaveCount(2);
  const duplicateId = await selector.inputValue();
  expect(duplicateId).not.toBe(originalId);
  await expect(pages.nth(1)).toHaveAttribute('data-page-id', duplicateId);
  await expect(pages.nth(1).getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Original pending text');

  await pages.nth(1).getByRole('textbox', { name: 'Текст на странице', exact: true }).first().fill('Independent duplicate');
  await pageAction('Выше');
  await expect(pages.first()).toHaveAttribute('data-page-id', duplicateId);
  await expect(selector).toHaveValue(duplicateId);
  await expect(pages.first().getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Independent duplicate');
  await expect(pages.nth(1).getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Original pending text');
  await trigger.click();
  await expect(above).toBeDisabled();
  await expect(below).toBeEnabled();
  await below.press('Home');
  await expect(duplicate).toBeFocused();
  await duplicate.press('ArrowDown');
  await expect(below).toBeFocused();
  await below.press('Enter');
  await expect(pages.nth(1)).toHaveAttribute('data-page-id', duplicateId);
  await expect(selector).toHaveValue(duplicateId);
  await trigger.click();
  await expect(above).toBeEnabled();
  await expect(below).toBeDisabled();
  await remove.click();
  await expect(pages).toHaveCount(1);
  await expect(selector).toHaveValue(originalId);
  await expect(pages.first().getByRole('textbox', { name: 'Текст на странице', exact: true }).first()).toHaveValue('Original pending text');
  await trigger.click();
  await expect(remove).toBeDisabled();
});

test('header and footer contain their controls without overlapping the document workspace', async () => {
  const header = page.locator('.app-header');
  const toolbar = page.locator('.element-toolbar');
  const canvas = page.getByRole('region', { name: 'Рабочая область документа', exact: true });
  const headerControls = [
    header.getByRole('heading', { level: 1 }),
    header.getByRole('button', { name: 'Файл', exact: true }),
    header.getByRole('button', { name: 'Отменить', exact: true }),
    header.getByRole('button', { name: 'Повторить', exact: true }),
    header.getByRole('button', { name: 'Добавить', exact: true }),
    header.getByRole('button', { name: 'Открыть предпросмотр', exact: true }),
    header.getByRole('button', { name: 'Структура', exact: true }),
    header.getByRole('button', { name: /^Сохранить(?: ·)?$/ }),
    header.getByRole('button', { name: /PDF/ })
  ];
  const footerControls = [
    footer().getByRole('combobox', { name: 'Текущая страница', exact: true }),
    footer().getByRole('button', { name: 'Действия со страницей', exact: true }),
    footer().getByRole('button', { name: /^Уменьшить(?: масштаб)?$/ }),
    footer().getByRole('button', { name: /^Увеличить(?: масштаб)?$/ }),
    footer().getByText(/^\d+%$/),
    footer().getByRole('button', { name: 'По ширине', exact: true }),
    footer().getByRole('button', { name: 'Вся страница', exact: true })
  ];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 700, height: 560 }]) {
    await page.setViewportSize(viewport);
    for (const control of [...headerControls, ...footerControls]) await expect(control).toBeVisible();
    await expect(async () => {
      const [headerBox, toolbarBox, canvasBox, footerBox] = await Promise.all([
        header.boundingBox(), toolbar.boundingBox(), canvas.boundingBox(), footer().boundingBox()
      ]);
      ok(headerBox && toolbarBox && canvasBox && footerBox, 'All editor regions must be visible');
      expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(toolbarBox.y + 1);
      expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(canvasBox.y + 1);
      expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(footerBox.y + 1);
      expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(viewport.height + 1);
      for (const [controls, container] of [[headerControls, headerBox], [footerControls, footerBox]] as const) {
        for (const control of controls) {
          const box = await control.boundingBox();
          ok(box, 'Each editor control must be visible');
          expect(box.x).toBeGreaterThanOrEqual(container.x - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width + 1);
          expect(box.y).toBeGreaterThanOrEqual(container.y - 1);
          expect(box.y + box.height).toBeLessThanOrEqual(container.y + container.height + 1);
        }
      }
    }).toPass();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('footer zoom and fit change the page size and remain usable in preview', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const canvas = page.getByRole('region', { name: 'Рабочая область документа', exact: true });
  const sheet = page.getByTestId('editor-page').first().locator('.page');
  const percent = footer().getByText(/^\d+%$/);
  const increase = footer().getByRole('button', { name: /^Увеличить(?: масштаб)?$/ });
  const decrease = footer().getByRole('button', { name: /^Уменьшить(?: масштаб)?$/ });
  const width = (): Promise<number> => sheet.evaluate(node => node.getBoundingClientRect().width);

  await footer().getByRole('button', { name: 'Вся страница', exact: true }).click();
  await expect.poll(async () => {
    const [sheetBox, canvasBox] = await Promise.all([sheet.boundingBox(), canvas.boundingBox()]);
    return !!sheetBox && !!canvasBox && sheetBox.height <= canvasBox.height && sheetBox.width <= canvasBox.width;
  }).toBe(true);
  const wholeWidth = await width();
  await footer().getByRole('button', { name: 'По ширине', exact: true }).click();
  await expect.poll(width).toBeGreaterThan(wholeWidth);
  const fittedWidth = await width();
  const fittedPercent = await percent.innerText();
  await decrease.click();
  await expect.poll(width).toBeLessThan(fittedWidth);
  await expect(percent).not.toHaveText(fittedPercent);
  await increase.click();
  await expect.poll(width).toBeCloseTo(fittedWidth, 0);
  await expect(percent).toHaveText(fittedPercent);

  await page.getByRole('button', { name: 'Открыть предпросмотр', exact: true }).click();
  await expect(page.locator('.element-toolbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Файл', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0);
  await expect(footer().getByRole('combobox', { name: 'Текущая страница', exact: true })).toBeVisible();
  await expect(footer().getByRole('button', { name: 'Действия со страницей', exact: true })).toHaveCount(0);
  await footer().getByRole('button', { name: 'Вся страница', exact: true }).click();
  const previewWidth = await width();
  await increase.click();
  await expect.poll(width).toBeGreaterThan(previewWidth);
  await footer().getByRole('button', { name: 'По ширине', exact: true }).click();
  await expect(percent).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться к редактированию', exact: true }).click();
  await expect(page.locator('.element-toolbar')).toBeVisible();
  await expect(footer().getByRole('combobox', { name: 'Текущая страница', exact: true })).toBeVisible();
});

test('page menu actions remain clickable while a status notification is visible', async () => {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const notice = page.getByRole('status').filter({ hasText: 'Создан новый проект' });
  await expect(notice).toBeVisible();
  await pageAction('Дублировать страницу');
  await footer().getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  const remove = page.getByRole('menuitem', { name: 'Удалить страницу', exact: true });
  await expect(remove).toBeEnabled();

  const receivesPointer = await remove.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  });
  expect(receivesPointer).toBe(true);
  await remove.click();
  await expect(page.getByTestId('editor-page')).toHaveCount(1);
  await expect(notice).toBeVisible();
});
