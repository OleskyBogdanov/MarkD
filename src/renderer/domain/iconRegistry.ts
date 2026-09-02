import {
  AtSign, Award, Badge, Banknote, Bell, Boxes, Briefcase, Building2, Calculator, CalendarDays,
  ChartBar, ChartLine, CircleCheck, CircleHelp, Clipboard, Clock, Coins, Contact, CreditCard,
  Factory, FileText, Flag, Folder, Globe, Handshake, Hash, Headset, Heart, Info, Landmark, Link, List,
  Mail, MapPin, Megaphone, MessageCircle, Navigation, Package, Percent, Phone, Plane, Presentation,
  Receipt, Route, Send, Ship, ShoppingBag, ShoppingCart, Smartphone, Star, Store, Table2, Tag, Target,
  TrendingUp, TriangleAlert, Truck, User, Users, Wallet, Warehouse, type LucideIcon
} from 'lucide-react';
import type { IconName } from '@/renderer/domain/model';
import iconLicenseUrl from '@/renderer/assets/icons/LICENSE.txt?url';

export const DOCUMENT_ICON_LICENSE_URL = iconLicenseUrl;

export const DOCUMENT_ICON_REGISTRY: Record<IconName, LucideIcon> = {
  user: User, users: Users, contact: Contact, phone: Phone, smartphone: Smartphone, mail: Mail,
  'at-sign': AtSign, 'map-pin': MapPin, globe: Globe, link: Link,
  briefcase: Briefcase, building: Building2, store: Store, factory: Factory, landmark: Landmark,
  badge: Badge, award: Award, handshake: Handshake, presentation: Presentation, calendar: CalendarDays,
  'file-text': FileText, folder: Folder, clipboard: Clipboard, list: List, table: Table2, clock: Clock,
  info: Info, help: CircleHelp, alert: TriangleAlert, check: CircleCheck,
  wallet: Wallet, 'credit-card': CreditCard, banknote: Banknote, receipt: Receipt, percent: Percent,
  calculator: Calculator, 'chart-bar': ChartBar, 'chart-line': ChartLine, 'trending-up': TrendingUp, coins: Coins,
  'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag, package: Package, boxes: Boxes, truck: Truck,
  plane: Plane, ship: Ship, warehouse: Warehouse, route: Route, navigation: Navigation,
  message: MessageCircle, send: Send, bell: Bell, megaphone: Megaphone, headset: Headset, star: Star,
  heart: Heart, flag: Flag, target: Target, tag: Tag, hash: Hash
};

export const ICON_LABELS: Record<IconName, string> = {
  user: 'Пользователь', users: 'Команда', contact: 'Контакт', phone: 'Телефон', smartphone: 'Смартфон',
  mail: 'Почта', 'at-sign': 'Адрес почты', 'map-pin': 'Метка на карте', globe: 'Глобус', link: 'Ссылка',
  briefcase: 'Портфель', building: 'Компания', store: 'Магазин', factory: 'Производство', landmark: 'Учреждение',
  badge: 'Знак', award: 'Награда', handshake: 'Рукопожатие', presentation: 'Презентация', calendar: 'Календарь',
  'file-text': 'Документ', folder: 'Папка', clipboard: 'Буфер', list: 'Список', table: 'Таблица', clock: 'Время',
  info: 'Информация', help: 'Помощь', alert: 'Предупреждение', check: 'Готово',
  wallet: 'Кошелёк', 'credit-card': 'Карта', banknote: 'Банкнота', receipt: 'Чек', percent: 'Процент',
  calculator: 'Калькулятор', 'chart-bar': 'Столбчатый график', 'chart-line': 'Линейный график',
  'trending-up': 'Рост', coins: 'Монеты', 'shopping-cart': 'Корзина', 'shopping-bag': 'Покупка',
  package: 'Посылка', boxes: 'Коробки', truck: 'Грузовик', plane: 'Самолёт', ship: 'Корабль',
  warehouse: 'Склад', route: 'Маршрут', navigation: 'Навигация', message: 'Сообщение', send: 'Отправить',
  bell: 'Уведомление', megaphone: 'Объявление', headset: 'Поддержка', star: 'Звезда', heart: 'Сердце',
  flag: 'Флаг', target: 'Цель', tag: 'Метка', hash: 'Номер'
};

export const ICON_GROUPS: ReadonlyArray<{ label: string; icons: readonly IconName[] }> = [
  { label: 'Контакты', icons: ['user', 'users', 'contact', 'phone', 'smartphone', 'mail', 'at-sign', 'map-pin', 'globe', 'link'] },
  { label: 'Бизнес', icons: ['briefcase', 'building', 'store', 'factory', 'landmark', 'badge', 'award', 'handshake', 'presentation', 'calendar'] },
  { label: 'Документы и статусы', icons: ['file-text', 'folder', 'clipboard', 'list', 'table', 'clock', 'info', 'help', 'alert', 'check'] },
  { label: 'Финансы', icons: ['wallet', 'credit-card', 'banknote', 'receipt', 'percent', 'calculator', 'chart-bar', 'chart-line', 'trending-up', 'coins'] },
  { label: 'Торговля и логистика', icons: ['shopping-cart', 'shopping-bag', 'package', 'boxes', 'truck', 'plane', 'ship', 'warehouse', 'route', 'navigation'] },
  { label: 'Коммуникация и метки', icons: ['message', 'send', 'bell', 'megaphone', 'headset', 'star', 'heart', 'flag', 'target', 'tag', 'hash'] }
];
