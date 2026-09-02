import { describe, expect, test } from 'vitest';
import { FONT_IDS } from '@/renderer/domain/model';
import { DOCUMENT_FONTS, fontFamilyForId } from '@/renderer/domain/fontRegistry';
import { ICON_NAMES } from '@/renderer/domain/model';
import { DOCUMENT_ICON_REGISTRY } from '@/renderer/domain/iconRegistry';

describe('встроенные ресурсы документа', () => {
  test('содержит полный каталог из 20 переносимых шрифтов', () => {
    expect(FONT_IDS).toHaveLength(20);
    expect(DOCUMENT_FONTS.map((font) => font.id)).toEqual([...FONT_IDS]);
    expect(new Set(DOCUMENT_FONTS.map((font) => font.family)).size).toBe(20);
    expect(fontFamilyForId('inter')).toContain('MarkD Inter');
  });

  test('каждая разрешённая иконка имеет локальный компонент', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(DOCUMENT_ICON_REGISTRY).sort()).toEqual([...ICON_NAMES].sort());
  });
});
