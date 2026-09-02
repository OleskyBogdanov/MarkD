import type { FontId } from '@/renderer/domain/model';
import golosTextLicense from '@/renderer/assets/fonts/golos-text/LICENSE.txt?url';
import interLicense from '@/renderer/assets/fonts/inter/LICENSE.txt?url';
import robotoLicense from '@/renderer/assets/fonts/roboto/LICENSE.txt?url';
import openSansLicense from '@/renderer/assets/fonts/open-sans/LICENSE.txt?url';
import montserratLicense from '@/renderer/assets/fonts/montserrat/LICENSE.txt?url';
import manropeLicense from '@/renderer/assets/fonts/manrope/LICENSE.txt?url';
import ptSansLicense from '@/renderer/assets/fonts/pt-sans/LICENSE.txt?url';
import notoSansLicense from '@/renderer/assets/fonts/noto-sans/LICENSE.txt?url';
import sourceSansLicense from '@/renderer/assets/fonts/source-sans-3/LICENSE.txt?url';
import rubikLicense from '@/renderer/assets/fonts/rubik/LICENSE.txt?url';
import ptSerifLicense from '@/renderer/assets/fonts/pt-serif/LICENSE.txt?url';
import notoSerifLicense from '@/renderer/assets/fonts/noto-serif/LICENSE.txt?url';
import sourceSerifLicense from '@/renderer/assets/fonts/source-serif-4/LICENSE.txt?url';
import merriweatherLicense from '@/renderer/assets/fonts/merriweather/LICENSE.txt?url';
import robotoSlabLicense from '@/renderer/assets/fonts/roboto-slab/LICENSE.txt?url';
import loraLicense from '@/renderer/assets/fonts/lora/LICENSE.txt?url';
import playfairLicense from '@/renderer/assets/fonts/playfair-display/LICENSE.txt?url';
import literataLicense from '@/renderer/assets/fonts/literata/LICENSE.txt?url';
import jetBrainsMonoLicense from '@/renderer/assets/fonts/jetbrains-mono/LICENSE.txt?url';
import robotoMonoLicense from '@/renderer/assets/fonts/roboto-mono/LICENSE.txt?url';

export type FontCategory = 'sans' | 'serif' | 'mono';

export type DocumentFont = {
  id: FontId;
  label: string;
  family: string;
  category: FontCategory;
  supportsItalic: boolean;
  licenseUrl: string;
};

export const DOCUMENT_FONTS: readonly DocumentFont[] = [
  { id: 'golos-text', label: 'Golos Text', family: 'MarkD Golos Text', category: 'sans', supportsItalic: false, licenseUrl: golosTextLicense },
  { id: 'inter', label: 'Inter', family: 'MarkD Inter', category: 'sans', supportsItalic: true, licenseUrl: interLicense },
  { id: 'roboto', label: 'Roboto', family: 'MarkD Roboto', category: 'sans', supportsItalic: true, licenseUrl: robotoLicense },
  { id: 'open-sans', label: 'Open Sans', family: 'MarkD Open Sans', category: 'sans', supportsItalic: true, licenseUrl: openSansLicense },
  { id: 'montserrat', label: 'Montserrat', family: 'MarkD Montserrat', category: 'sans', supportsItalic: true, licenseUrl: montserratLicense },
  { id: 'manrope', label: 'Manrope', family: 'MarkD Manrope', category: 'sans', supportsItalic: false, licenseUrl: manropeLicense },
  { id: 'pt-sans', label: 'PT Sans', family: 'MarkD PT Sans', category: 'sans', supportsItalic: true, licenseUrl: ptSansLicense },
  { id: 'noto-sans', label: 'Noto Sans', family: 'MarkD Noto Sans', category: 'sans', supportsItalic: true, licenseUrl: notoSansLicense },
  { id: 'source-sans-3', label: 'Source Sans 3', family: 'MarkD Source Sans 3', category: 'sans', supportsItalic: true, licenseUrl: sourceSansLicense },
  { id: 'rubik', label: 'Rubik', family: 'MarkD Rubik', category: 'sans', supportsItalic: true, licenseUrl: rubikLicense },
  { id: 'pt-serif', label: 'PT Serif', family: 'MarkD PT Serif', category: 'serif', supportsItalic: true, licenseUrl: ptSerifLicense },
  { id: 'noto-serif', label: 'Noto Serif', family: 'MarkD Noto Serif', category: 'serif', supportsItalic: true, licenseUrl: notoSerifLicense },
  { id: 'source-serif-4', label: 'Source Serif 4', family: 'MarkD Source Serif 4', category: 'serif', supportsItalic: true, licenseUrl: sourceSerifLicense },
  { id: 'merriweather', label: 'Merriweather', family: 'MarkD Merriweather', category: 'serif', supportsItalic: true, licenseUrl: merriweatherLicense },
  { id: 'roboto-slab', label: 'Roboto Slab', family: 'MarkD Roboto Slab', category: 'serif', supportsItalic: false, licenseUrl: robotoSlabLicense },
  { id: 'lora', label: 'Lora', family: 'MarkD Lora', category: 'serif', supportsItalic: true, licenseUrl: loraLicense },
  { id: 'playfair-display', label: 'Playfair Display', family: 'MarkD Playfair Display', category: 'serif', supportsItalic: true, licenseUrl: playfairLicense },
  { id: 'literata', label: 'Literata', family: 'MarkD Literata', category: 'serif', supportsItalic: true, licenseUrl: literataLicense },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', family: 'MarkD JetBrains Mono', category: 'mono', supportsItalic: true, licenseUrl: jetBrainsMonoLicense },
  { id: 'roboto-mono', label: 'Roboto Mono', family: 'MarkD Roboto Mono', category: 'mono', supportsItalic: true, licenseUrl: robotoMonoLicense }
];

const FONT_BY_ID = new Map(DOCUMENT_FONTS.map((font) => [font.id, font]));

export const fontFamilyForId = (fontId: FontId): string => {
  const font = FONT_BY_ID.get(fontId) ?? FONT_BY_ID.get('inter')!;
  const fallback = font.category === 'serif'
    ? 'MarkD Noto Serif'
    : font.category === 'mono'
      ? 'MarkD JetBrains Mono'
      : 'MarkD Noto Sans';
  const generic = font.category === 'serif' ? 'serif' : font.category === 'mono' ? 'monospace' : 'sans-serif';
  return `'${font.family}', '${fallback}', ${generic}`;
};

export const fontSupportsItalic = (fontId: FontId): boolean => FONT_BY_ID.get(fontId)?.supportsItalic ?? false;
