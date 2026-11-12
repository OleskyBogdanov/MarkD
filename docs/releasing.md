# Выпуск и обновления MarkD

## Канал и согласие

Источник — публичный GitHub Releases `OleskyBogdanov/MarkD`,
`package.json → repository.url`. Сервер и `MARKD_UPDATE_URL` не нужны;
токены/ключи в клиент не встраиваются, renderer источник не меняет.
Локальные версии: builder 26.15.3, updater 6.8.9;
[миграция v27](plans/electron-builder-v27-migration.md) — отдельный gate.

Только `package:release` добавляет `markd-release.json`: канал включён,
но маркер не заменяет подпись. Dev/E2E/обычные пакеты feed не проверяют.
Проверка: через 15 секунд, каждые 6 часов, вручную.
`autoDownload=false`, `autoInstallOnAppQuit=false`: скачивание и установка
по отдельным действиям. Downgrade/prerelease выключены; draft невидим,
notes — текст. Ошибка сети не блокирует работу, запросы объединяются.

До установки: flush, включая IME, «Сохранить / Не сохранять / Отмена».
Cancel/отмена Save As/ошибка записи блокируют установку. Save подтверждает
свою сессию/ревизию; новые правки остаются dirty. Ошибка установки возвращает
рабочий режим; «Позже» сохраняет работу.

## Обычные пакеты

**Verify desktop** после typecheck, lint, unit и Electron E2E создаёт
пакеты ручной установки без настроенных сертификатов:

| Платформа | Файл | Артефакт Actions |
| --- | --- | --- |
| macOS ARM64 | `MarkD-X.Y.Z-arm64.zip` | `installers-macos-15` |
| macOS Intel x64 | `MarkD-X.Y.Z-x64.zip` | `installers-macos-15-intel` |
| Windows x64 | `MarkD-Setup-X.Y.Z-x64.exe` | `installers-windows-2022` |

Mac: ad-hoc подпись, fuses, запуск `.app`; Windows: установка NSIS/запуск.
Каталоги Mac: x64 `mac/`, ARM64 `mac-arm64/`.
Обновите версию/lockfile/описание, отправьте в main, дождитесь трёх jobs
на точном коммите. Полный набор этого запуска приложите к новому релизу
с большим номером, указав ручную установку, отсутствие Developer ID/
notarization, Windows signing и автообновления. `latest*.yml` обычных сборок
не публикуются как канал; пустые релизы и замена вложений запрещены.

## Сертификаты и права

GitHub environment `release`:

| Переменная | Значение |
| --- | --- |
| `MARKD_MAC_IDENTITY` | Полное Developer ID Application identity; `-` запрещено |
| `MARKD_WINDOWS_PUBLISHER` | Издатель точно по сертификату Windows |

Secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`,
`WIN_CSC_KEY_PASSWORD`. Локально для Mac — `CSC_LINK`, `CSC_KEY_PASSWORD`.
Секреты не хранятся в проекте.

`npm run package:release`: `forceCodeSigning`, отказ без настроек.
Mac: Developer ID, hardened runtime, notarization, DMG + ZIP;
Windows: NSIS/проверка издателя. Production не переподписывается ad-hoc.
Аппаратный ключ/Trusted Signing Windows настраиваются отдельно.

Сборки: `contents: read`; отдельный publish job: `contents: write`,
краткоживущий `github.token`, недоступный упаковщику. Репозиторий публичный;
workflow требует совпадения `repository.url` с репозиторием запуска.

## Файлы подписанного релиза

Все архитектуры входят в один стабильный тег `vX.Y.Z`:

| Клиент | Канал | Metadata | Пакеты |
| --- | --- | --- | --- |
| macOS ARM64 | `latest-arm64` | `latest-arm64-mac.yml` | `MarkD-X.Y.Z-arm64.dmg`, `MarkD-X.Y.Z-arm64.zip` |
| macOS Intel x64 | `latest-x64` | `latest-x64-mac.yml` | `MarkD-X.Y.Z-x64.dmg`, `MarkD-X.Y.Z-x64.zip` |
| Windows x64 | `latest` | `latest.yml` | `MarkD-Setup-X.Y.Z-x64.exe` |

Включаются blockmaps. Раздельные стабильные Mac-каналы исключают перезапись;
runtime сверяет архитектуру. Builder создаёт `app-update.yml`/metadata
при `--publish never`, ручной правки нет. ZIP — updater, DMG — установка.

## Порядок публикации

1. `npm version X.Y.Z --no-git-tag-version --ignore-scripts`; отправьте
   версию/lockfile. Номер выше опубликованного.
2. Actions → **Build signed GitHub release draft**, нужный ref, без
   предварительного тега. Preflight: публичность, stable version, свободный тег.
3. Три jobs: typecheck/lint/unit/Electron E2E, подпись, упаковка, smoke;
   Windows — установленный NSIS.
4. После успеха всех jobs создаётся полный **Draft** `vX.Y.Z` на точном
   commit запуска. Нет пакета/metadata — отказ. `--clobber` не используется.
5. Проверьте сертификаты/notarization/установку. N → N+1: тестовый публичный
   репозиторий, два подписанных stable выпуска, клиент для этого источника.
   Production не читает draft/prerelease.
6. Сверьте тег/описание/вложения, **Publish release** как стабильный
   **Latest**. Теперь обновление доступно клиентам.

Пакеты опубликованной версии неизменяемы; исправления — большим semver.
Старые пакеты/blockmaps сохраняются для поддерживаемых переходов;
если differential download невозможен, допустим полный пакет.
Сохраните `appId=com.markd.desktop`, имя, профиль и правила установки.
Старому клиенту без updater нужна одна ручная переходная установка;
переход с unsigned пакета проверяется отдельно.

## Неподтверждённые внешние ворота

Обычные пакеты трёх архитектур/установленный NSIS проверялись в CI.
Локальные HTTP-тесты provider подтверждают выбор файлов/отсутствие токена;
проверка схемы builder не доказывает подпись.
Developer ID/notarization, Windows signing и реальный N → N+1 двух
подписанных установок остаются внешними воротами. Windows Server 2022
в CI не заменяет приёмку Windows 10/11.

На обеих архитектурах Mac и Windows x64 проверьте проекты/профиль,
Save/Cancel/ошибку Save, отмену пути, сеть/404/битую metadata, обрыв загрузки,
неверные checksum/подпись, место на диске, права/UAC, «Позже», повторные
запросы, старые `.markd`/`.kpdoc`, PDF, ассоциации файлов и переходную
установку. Отозванный релиз/кеш не должен приводить к установке
непредусмотренной версии. Mock-тесты и build не заменяют эту матрицу.

Принудительное завершение ограничивает восстановление последним recovery.
При зависшем renderer через 30 секунд нативный диалог предлагает отмену
закрытия либо закрытие с предупреждением о потере последних правок.
Историческое наблюдение о `CLOSE_ACK` — в [проектных заметках](project-notes.md).
