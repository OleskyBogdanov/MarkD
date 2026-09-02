import type { FontId } from '@/renderer/domain/model';
import { DOCUMENT_FONTS, fontFamilyForId, type FontCategory } from '@/renderer/domain/fontRegistry';

type FontSelectProps = {
  value: FontId;
  onChange: (fontId: FontId) => void;
};

const GROUPS: ReadonlyArray<{ category: FontCategory; label: string }> = [
  { category: 'sans', label: 'Без засечек' },
  { category: 'serif', label: 'С засечками' },
  { category: 'mono', label: 'Моноширинные' }
];

export const FontSelect = ({ value, onChange }: FontSelectProps) => (
  <select
    value={value}
    style={{ fontFamily: fontFamilyForId(value) }}
    onChange={(event) => onChange(event.currentTarget.value as FontId)}
  >
    {GROUPS.map((group) => (
      <optgroup key={group.category} label={group.label}>
        {DOCUMENT_FONTS
          .filter((font) => font.category === group.category)
          .map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: fontFamilyForId(font.id) }}>
              {font.label}
            </option>
          ))}
      </optgroup>
    ))}
  </select>
);
