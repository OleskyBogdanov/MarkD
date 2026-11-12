# Формат проекта и редактор

## Переносимость

`.markd` — JSON schema v4: страницы/слои/элементы/стили, миллиметры,
base64 `data:` изображения по `assetId`, без путей автора. Для передачи
нужны файл и совместимый MarkD. v1/v2/v3 и legacy `.kpdoc` мигрируют
без перезаписи оригинала; Save пишет v4/`.markd`. Будущая версия отклоняется.

Лимиты: 64 МиБ проект/12 МиБ изображение, канонический JSON в UTF-8 байтах,
проверка до/во время чтения. Assets: уникальные ID, MIME allowlist, base64,
сигнатура, размер, декодируемость; ссылки layer/asset/option/styles валидны,
page/element/row/column/option ID уникальны. Orphan assets очищаются.

Запись: temp рядом, синхронизация, замена, `.bak` предыдущей версии;
ошибка rename не разрешает удалять оригинал. Ошибки сохраняют данные.
`projects`/`exports`/`logs` — в `app.getPath('userData')`, пользовательские
пути свободны. ZIP — отдельная миграция только по измеренному давлению размера.

## Шрифты и иконки документа

Локальные шрифты без CDN/зависимости от ОС, в проекте только `fontId`.
Общий registry всех текстов/таблиц:

```text
golos-text inter roboto open-sans montserrat manrope pt-sans noto-sans
source-sans-3 rubik pt-serif noto-serif source-serif-4 merriweather
roboto-slab lora playfair-display literata jetbrains-mono roboto-mono
```

Источник/версия/SHA-256/лицензия/веса/italic закреплены; проверяются
кириллица/Ёё/№/₽/fallback. 19 семейств — OFL 1.1, Roboto Slab — Apache 2.0;
лицензии поставляются, subsetting учитывает Reserved Font Name.
Неподдерживаемый italic не синтезируется.

Новые метрики/файлы требуют нового `renderProfileVersion`; неизвестный
`fontId` — диагностики/совместимости, без молчаливого обещания идентичности.

`document-icons-v1`: стабильные ID MarkD, геометрия в `iconPackVersion`;
60 ID плюс legacy `hash`:

```text
user users contact phone smartphone mail at-sign map-pin globe link
briefcase building store factory landmark badge award handshake presentation calendar
file-text folder clipboard list table clock info help alert check
wallet credit-card banknote receipt percent calculator chart-bar chart-line trending-up coins
shopping-cart shopping-bag package boxes truck plane ship warehouse route navigation
message send bell megaphone headset star heart flag target tag hash
```

Лицензии ISC Lucide/MIT Feather поставляются, произвольный SVG запрещён;
picker поддерживает поиск/клавиатуру. Профиль сохраняет переносы/геометрию.

## Сессия и оформление

Сохранение использует flush/IME, сессию/ревизию и Save/Discard/Cancel.
Recovery отделён от оригинала, хранит предыдущую генерацию;
правки после снимка не гарантированы.

Слои общие, active layer локален; выбор доступного элемента активирует слой.
Запись требует видимого разблокированного активного слоя/store guard;
скрытый слой не выводится в PDF, Undo сохраняет структуру.

Optional sparse `cell.style` привязан к ячейке; без него legacy
строка → колонка → таблица, без миграции. Форматирование: одно свойство/Undo.
Новый шрифт сохраняет смешанный italic, если поддерживает его.
После shared-schema изменения пересобрать main/preload/renderer:
старый main-парсер удаляет неизвестное поле.

## Компоновка и клавиатура

Сверху документ/контекст, снизу страницы/zoom/обновления. Контекст: 84 px,
без сдвига холста. Прокрутка: `.canvas-col`, `.inspector-layers-pane`;
`.element-toolbar` — горизонтальная, но табличные группы переносятся.
Редкие действия — native popover.
Свойства переехали справа наверх; структура — аккордеон с отдельными
выбором/раскрытием, страницей/действиями элемента.

Имя: Enter/blur/Save применяют, Escape отменяет, пустое не затирает.
Фон — активного листа; текст — на холсте. Страницы: дублирование/порядок/
удаление с flush и защитой последней.

ЛКМ по полям строк/колонок и маркерам ячеек выбирает диапазон;
Shift+щелчок/стрелки расширяет, Space выбирает, Enter/F2 редактирует,
Escape возвращает таблицу. Подсветка под текстом; ручки масштабируются,
включая 25%. Ctrl+колесо масштабирует документ 25–200%, обычное прокручивает;
chrome не масштабируется. Есть fit width/page и hint preview по hover/focus.
Меню: стрелки, Home/End, Escape, Tab, disabled и возврат фокуса.
Геометрия — на холсте, изображение — «На весь лист», HEX — с альфой.

Overflow учитывает видимый текст/черновик/шрифт/zoom, скрыт в preview/печати.
Ширина от 1024 px, 390 — стресс; тёмной темы нет.
VoiceOver/NVDA/полный контраст/200% текста не подтверждены.

## Диагностика и иконка приложения

JSONL `<userData>/logs`: ротация, события main/renderer/launcher, stack/
версии/reason; пути маскируются, текст/base64 не пишутся. Launcher проверяет
Electron Framework до main; packaged smoke — ресурсы/подпись/пять fuses/запуск.

`build/icon.icns` создаётся из `build/icon.png`:
`node scripts/icon-assets.mjs generate`; проверка:
`node scripts/icon-assets.mjs check [путь.icns]`.
macOS `sips`/`iconutil` проверяют десять обычных/Retina размеров и полное
декодирование, также внутри пакета. Автоконвертер builder давал `ic13`
512 вместо 256 px, `ic14` 1024 вместо 512 px; явный ICNS исправляет
кодирование без перерисовки логотипа.

Открытые исторические наблюдения, требующие воспроизведения:
macOS `open-file` без окна мог ждать активации; отмена таймера после
`CLOSE_ACK` могла оставить запрос без `CLOSE_RESPONSE`; очистка Windows-имени
могла сохранять `CON`, `NUL`, `COM1`, `LPT1`. Это не доказанные текущие баги.

Сохраняются sandbox, context isolation, renderer без Node, CSP, запрет
произвольных окон, узкий типизированный preload и проверка sender/payload IPC.
[Выпуск](releasing.md) и [импорт Excel](excel-import.md) описаны отдельно.
