import { describe, expect, test } from 'vitest';
import { snapRectToPage } from '@/renderer/features/editor/snapToPage';

const page = { widthMm: 210, heightMm: 297 };

describe('snapRectToPage', () => {
  test('примагничивает размер к правому и нижнему краю страницы', () => {
    const result = snapRectToPage(
      { x: 0, y: 0, width: 208.8, height: 295.5 },
      page,
      'resize',
      2
    );

    expect(result.rect).toEqual({ x: 0, y: 0, width: 210, height: 297 });
    expect(result.guides).toEqual({ vertical: 210, horizontal: 297 });
  });

  test('примагничивает перемещение к краям и центру страницы', () => {
    expect(snapRectToPage({ x: 1.5, y: 1, width: 50, height: 40 }, page, 'move', 2)).toEqual({
      rect: { x: 0, y: 0, width: 50, height: 40 },
      guides: { vertical: 0, horizontal: 0 }
    });

    expect(snapRectToPage({ x: 79, y: 127.5, width: 50, height: 40 }, page, 'move', 2)).toEqual({
      rect: { x: 80, y: 128.5, width: 50, height: 40 },
      guides: { vertical: 105, horizontal: 148.5 }
    });
  });

  test('не меняет геометрию за пределами порога прилипания', () => {
    const rect = { x: 5, y: 7, width: 198, height: 280 };
    expect(snapRectToPage(rect, page, 'resize', 2)).toEqual({ rect, guides: {} });
  });

  test('центрирует компонент относительно центра другого компонента', () => {
    const result = snapRectToPage(
      { x: 44, y: 54, width: 10, height: 10 },
      page,
      'move',
      2,
      [{ x: 30, y: 50, width: 40, height: 20 }]
    );

    expect(result).toEqual({
      rect: { x: 45, y: 55, width: 10, height: 10 },
      guides: { vertical: 50, horizontal: 60 }
    });
  });

  test('выравнивает края компонентов и показывает направляющую цели', () => {
    const result = snapRectToPage(
      { x: 61, y: 83, width: 10, height: 10 },
      page,
      'move',
      1,
      [{ x: 30, y: 50, width: 40, height: 20 }]
    );

    expect(result).toEqual({
      rect: { x: 60, y: 83, width: 10, height: 10 },
      guides: { vertical: 70 }
    });
  });

  test('примагничивает изменение размера к центрам и краям другого компонента', () => {
    const result = snapRectToPage(
      { x: 10, y: 20, width: 39, height: 39 },
      page,
      'resize',
      2,
      [{ x: 30, y: 50, width: 40, height: 20 }]
    );

    expect(result).toEqual({
      rect: { x: 10, y: 20, width: 40, height: 40 },
      guides: { vertical: 50, horizontal: 60 }
    });
  });
});
