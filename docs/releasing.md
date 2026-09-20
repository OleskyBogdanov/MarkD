# Выпуск и обновления MarkD

## Реализованный контракт

Закреплены electron-builder 26.15.3 и electron-updater 6.8.9. API updater 7 / конфигурация builder 27 здесь не используются. `autoDownload=false`, `autoInstallOnAppQuit=false`, downgrade и prerelease отключены. Проверка выполняется через 15 секунд после запуска подписанного release-пакета, затем каждые 6 часов либо вручную. Скачивание начинается по кнопке. Установка требует отдельного действия и проходит через тот же протокол сохранения, что закрытие окна. Release notes выводятся как текст.

Локальные `.app`, dev и E2E не обращаются к feed. Только `package:release` добавляет `markd-release.json` в resources; renderer не может менять URL. Клиент использует HTTPS generic provider, штатную проверку checksum и подписи updater. Наличие JSON само по себе не является проверкой подписи: доверие обеспечивается подписанным выпуском и защищённым каналом публикации.

## Настройка

В GitHub environment `release` задайте переменные:

| Имя | Значение |
| --- | --- |
| `MARKD_UPDATE_URL` | Постоянный публичный HTTPS base URL без query/credentials |
| `MARKD_MAC_IDENTITY` | Полное имя Developer ID Application identity; `-` запрещено |
| `MARKD_WINDOWS_PUBLISHER` | Издатель, точно совпадающий с сертификатом Windows |

Secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. Для локального запуска macOS использует `CSC_LINK` и `CSC_KEY_PASSWORD`. Секреты не хранить в файлах проекта.

`npm run package:release` требует сертификаты, включает `forceCodeSigning`; macOS — hardened runtime, notarization, DMG + ZIP; Windows — NSIS и `signtoolOptions.publisherName`. Скрипт проверяет обязательные настройки и прекращает работу при их отсутствии. Production-путь не запускает ad-hoc переподпись. Для другого механизма Windows signing (например, аппаратного ключа/Trusted Signing) требуется адаптировать скрипт и отдельно проверить подпись.

Workflow `release.yml` запускается вручную и создаёт **кандидаты выпуска**, не публикует их автоматически. Перед запуском поднять версию в package.json и package-lock.json. `MARKD_RELEASE_ARCH` позволяет выбрать архитектуру локально; по умолчанию используется архитектура runner. Выход каждой платформы/архитектуры раздаётся отдельно:

- `<base>/mac/arm64/`
- `<base>/mac/x64/`
- `<base>/win/x64/`

В каждом каталоге размещаются соответствующие артефакты и metadata, сгенерированные builder (`latest-mac.yml` либо `latest.yml`, ZIP/EXE, blockmaps). Это предотвращает коллизии metadata Intel/Apple Silicon. `app-update.yml` создаёт builder; вручную его не редактировать.

## Публикация

1. Пройти verify jobs на обеих ОС и архитектурах Mac.
2. Проверить сертификат, notarization, установку и запуск кандидата. Для Windows использовать установленный NSIS-пакет, не ограничиваться `win-unpacked`.
3. Пройти N → N+1 на реальной установленной подписанной версии для каждого канала: обычное обновление, Cancel, ошибка Save, отсутствие сети, повреждённый checksum/подпись, прерывание загрузки, права/UAC, сохранность профиля и старых документов.
4. Загрузить версионные бинарники и blockmaps. Проверить их доступность и хеши. Версионные файлы не заменять, предыдущие файлы сохранять для differential download.
5. Только после этого атомарно опубликовать channel metadata; для него использовать короткий cache TTL. Ошибочный выпуск заменять исправленным с **большим** semver, а не downgrade.

Старый MarkD 0.4.0 без обновлятора не сможет получить первый новый выпуск автоматически: нужна одна ручная установка с сохранением appId `com.markd.desktop`, имени приложения и профиля. Переход со старого unsigned пакета также требует отдельной проверки на пользовательской ОС.

## Что ещё требует внешней проверки

В рабочей среде разработки доступны macOS arm64 и локальная ad-hoc подпись. Windows runtime/NSIS, macOS Intel, Developer ID/notarization, Windows signing, HTTPS feed и обновление двух подписанных установок не подтверждены локальным прогоном. Workflow готовит эти проверки, но не заменяет их выполнение. Автоматизированные снимки PDF не являются утверждёнными визуальными baseline для Windows; их нужно принять после первого прогона на этой ОС.

При принудительном завершении процесса/сеанса ОС сохранение не гарантируется; восстановление ограничено последним recovery-снимком. При полностью зависшем renderer через 30 секунд нативный диалог предлагает отменить закрытие либо закрыть с предупреждением о возможной потере последних правок.

Источники API: [updater 6.8.9](https://github.com/electron-userland/electron-builder/blob/electron-updater%406.8.9/packages/electron-updater/src/AppUpdater.ts), [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [GitHub runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Конфигурация дополнительно сверяется с установленными типами и schema builder 26.
