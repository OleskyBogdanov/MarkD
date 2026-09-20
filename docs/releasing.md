# Выпуск и обновления MarkD через GitHub Releases

## Как работает обновление

Источник — публичные [GitHub Releases OleskyBogdanov/MarkD](https://github.com/OleskyBogdanov/MarkD/releases). Отдельный HTTPS-сервер, домен и `MARKD_UPDATE_URL` больше не нужны. Адрес репозитория задаётся в `package.json → repository.url` и фиксируется внутри release-пакета. Клиент использует штатный GitHub provider electron-updater 6.8.9, HTTPS и проверку checksum/подписи. Токен GitHub на компьютере пользователя не требуется и в приложение не включается.

Проверка выполняется через 15 секунд после запуска release-пакета, затем каждые 6 часов либо вручную. Скачивание начинается по кнопке; установка — после отдельного действия и проверки несохранённого документа. `autoDownload=false`, `autoInstallOnAppQuit=false`, downgrade и prerelease отключены. Черновики GitHub Releases клиент не видит. Release notes отображаются как текст.

Dev, E2E и обычные локальные пакеты не проверяют обновления: только `package:release` добавляет `markd-release.json`. Renderer не может менять источник. Этот файл не заменяет криптографическую подпись приложения.

## Подготовка один раз

В GitHub environment `release` задайте переменные:

| Имя | Значение |
| --- | --- |
| `MARKD_MAC_IDENTITY` | Полное имя Developer ID Application identity; `-` запрещено |
| `MARKD_WINDOWS_PUBLISHER` | Издатель, точно совпадающий с сертификатом Windows |

Secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. При локальной сборке macOS используются `CSC_LINK` и `CSC_KEY_PASSWORD`. Секреты не хранить в проекте.

`npm run package:release` включает `forceCodeSigning`; macOS — hardened runtime, notarization, DMG + ZIP; Windows — NSIS и проверку издателя. Скрипт прекращает работу при отсутствии настроек. Ad-hoc переподпись в production-пути не выполняется. Для аппаратного ключа/Trusted Signing Windows потребуется отдельная настройка подписания.

Публикация использует краткоживущий `github.token` в отдельном job с `contents: write`. Для сборок достаточно `contents: read`; токен публикации не передаётся упаковщику и не записывается в приложение. Репозиторий должен оставаться публичным. Для закрытого исходного кода можно выделить отдельный публичный репозиторий раздачи, но текущий workflow намеренно требует совпадения `repository.url` с репозиторием запуска.

## Файлы одного релиза

Builder 26.15.3 создаёт артефакты всех платформ для одного стабильного тега `vX.Y.Z`:

| Клиент | Канал provider | Metadata | Файлы версии |
| --- | --- | --- | --- |
| macOS Apple Silicon | `latest-arm64` | `latest-arm64-mac.yml` | `MarkD-X.Y.Z-arm64.dmg`, `.zip` |
| macOS Intel | `latest-x64` | `latest-x64-mac.yml` | `MarkD-X.Y.Z-x64.dmg`, `.zip` |
| Windows x64 | `latest` | `latest.yml` | `MarkD-Setup-X.Y.Z-x64.exe` |

Также загружаются созданные builder blockmaps. Раздельные каналы macOS исключают перезапись `latest-mac.yml` параллельными jobs. Это стабильные каналы архитектур, а не prerelease-каналы. Runtime проверяет соответствие канала архитектуре установленного приложения. `app-update.yml` создаёт builder; вручную его не редактировать. Metadata создаются и при `--publish never` в закреплённом builder 26.15.3; сетевую публикацию выполняет следующий job.

## Выпуск новой версии

1. Поднять стабильную версию: `npm version X.Y.Z --no-git-tag-version --ignore-scripts`. Опубликовать изменения `package.json` и lockfile. Для первого переходного выпуска подготовлена `0.4.1`; существующий `v0.4.0` не перезаписывается.
2. После добавления workflow в основную ветку запустить **Build signed GitHub release draft** через Actions → Run workflow на нужном ref. Предварительно создавать тег не нужно. Preflight проверяет публичность репозитория, стабильную версию и отсутствие уже занятого тега.
3. Jobs macOS arm64/Intel и Windows x64 выполняют typecheck, lint, unit, Electron E2E, подписывают и собирают пакеты. Проверяется запуск `.app`; Windows дополнительно устанавливает NSIS и запускает установленный `.exe`.
4. Только после успеха всех jobs финальный job собирает полный набор файлов и создаёт **Draft** `vX.Y.Z` на точном commit запуска. При отсутствии обязательного установщика или metadata он прекращает работу. Повторный запуск не заменяет опубликованную версию; `--clobber` не используется.
5. Скачать кандидаты, проверить сертификаты/notarization и установку. Проверку N → N+1 и отрицательных сценариев провести на тестовом публичном репозитории с двумя подписанными выпусками и клиентом, собранным для этого источника: production-клиент не читает draft/prerelease.
6. В GitHub Releases проверить все вложения, описание и тег, затем **Publish release** как обычный стабильный **Latest**. После этого клиенты увидят версию. Не публиковать пустой релиз заранее. Не редактировать бинарники уже опубликованного релиза; исправления выпускать с большим номером.

Матрица обновлений: обе архитектуры Mac и Windows x64; сохранность проектов/профиля, Save/Cancel/ошибка Save, отсутствие сети, обрыв загрузки, неверные checksum/подпись, права/UAC, старые `.markd`/`.kpdoc`. Успешная сборка и mock-тесты не заменяют реальную установку N → N+1.

Старый MarkD 0.4.0 без обновлятора требует **одну ручную установку** переходной версии. После настройки подписанного выпуска последующие версии загружаются из приложения. Сохранить `appId=com.markd.desktop`, имя приложения и профиль; отдельно проверить переход с старого unsigned пакета.

## Подтверждённое и оставшиеся проверки

Обычные пакеты macOS arm64/Intel и установленный NSIS Windows x64 проверены в CI. Тесты GitHub-интеграции используют настоящий provider закреплённого updater 6.8.9 с локальными HTTP-ответами: проверяют выбор файлов всех трёх платформ и отсутствие авторизации. Конфигурации подписанной сборки проверяются схемой установленного builder 26.15.3. Это не подтверждает криптографическую подпись или установку обновления.

Developer ID/notarization, Windows signing и N → N+1 двух подписанных установок ещё требуют реального прогона после настройки сертификатов. Windows CI использует Server 2022; приёмка на пользовательских Windows 10/11 остаётся частью выпуска. В этой задаче новые теги и GitHub Releases не создавались.

При принудительном завершении процесса/сеанса ОС восстановление ограничено последним recovery-снимком. При полностью зависшем renderer через 30 секунд нативный диалог предлагает отменить закрытие либо закрыть с предупреждением о возможной потере последних правок.

Источники: [GitHub provider updater 6.8.9](https://github.com/electron-userland/electron-builder/blob/electron-updater%406.8.9/packages/electron-updater/src/providers/GitHubProvider.ts), [GitHub publish configuration](https://www.electron.build/publish.html), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [gh release create](https://cli.github.com/manual/gh_release_create).
