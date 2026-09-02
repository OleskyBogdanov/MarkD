import {
  Briefcase,
  Building2,
  CalendarDays,
  Hash,
  Mail,
  MapPin,
  Phone,
  User,
  type LucideIcon
} from 'lucide-react';
import type { IconName } from '@/renderer/domain/model';

export const DOCUMENT_ICON_REGISTRY: Record<IconName, LucideIcon> = {
  briefcase: Briefcase,
  building: Building2,
  calendar: CalendarDays,
  hash: Hash,
  mail: Mail,
  'map-pin': MapPin,
  phone: Phone,
  user: User
};

export const ICON_LABELS: Record<IconName, string> = {
  briefcase: 'Портфель',
  building: 'Компания',
  calendar: 'Календарь',
  hash: 'Номер',
  mail: 'Почта',
  'map-pin': 'Адрес',
  phone: 'Телефон',
  user: 'Контакт'
};
