# Discord Music Bot

Discord-бот для воспроизведения музыки с YouTube в голосовых каналах. Поддерживает поиск по названию, очередь треков, управление громкостью и повтор.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить сервер + бота (порт 5000)
- `pnpm run typecheck` — полная проверка типов
- `pnpm run build` — typecheck + сборка всех пакетов
- Required env: `DISCORD_TOKEN` — токен Discord-бота

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14, @discordjs/voice
- Аудио: yt-dlp (системный), ffmpeg (системный), @discordjs/opus
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — весь код Discord-бота
- `artifacts/api-server/src/bot/commands/` — slash-команды
- `artifacts/api-server/src/bot/player.ts` — плеер + интеграция с yt-dlp
- `artifacts/api-server/src/bot/queue.ts` — очередь треков
- `artifacts/api-server/src/bot/manager.ts` — менеджер плееров по серверам

## Bot Commands

| Команда | Описание |
|---------|----------|
| `/play <запрос>` | Воспроизвести трек с YouTube (ссылка или название) |
| `/pause` | Поставить на паузу |
| `/resume` | Продолжить воспроизведение |
| `/skip` | Пропустить текущий трек |
| `/stop` | Остановить и покинуть канал |
| `/volume <0-200>` | Установить громкость |
| `/queue` | Показать очередь |
| `/nowplaying` | Что сейчас играет |
| `/loop` | Вкл/выкл повтор трека |
| `/shuffle` | Перемешать очередь |
| `/remove <номер>` | Удалить трек из очереди |

## Architecture decisions

- Бот запускается внутри API-сервера (Express), а не как отдельный процесс — упрощает деплой
- Для стриминга аудио используется системный `yt-dlp` + `ffmpeg` через `child_process.spawn` вместо Node.js библиотек — надёжнее и без нативных зависимостей в esbuild
- Глобальные slash-команды регистрируются автоматически при старте бота
- Каждый Discord-сервер получает свой независимый `GuildPlayer` с отдельной очередью

## Gotchas

- `@snazzah/davey` и `prism-media` нужно держать в `dependencies` (не externalized) — они нужны `@discordjs/voice` в рантайме
- Команды регистрируются глобально — может занять до 1 часа для обновления на всех серверах
- yt-dlp путь захардкожен: `/nix/store/39bpsx6xv7qrcnnbv65zmh8sabqdyl49-yt-dlp-2024.12.23/bin/yt-dlp`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
