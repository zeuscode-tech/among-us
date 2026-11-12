# Among Us — Backend MVP

Самостоятельный серверный модуль для [zeuscode-tech/among-us](https://github.com/zeuscode-tech/among-us). Node.js 20+, Express, TypeScript, Socket.IO. Временное хранение в `Map`, без БД.

## Запуск

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

`GET http://localhost:3001/health` → `{ "ok": true, "service": "among-us-server" }`.

Сборка и тесты:

```bash
npm run build
npm test
npm start
```

**Интеграция:** скопировать папки `server/`, `shared/`, `docs/socket-events.md` в корень командного репозитория. Клиент подключается через `socket.io-client` к `http://localhost:3001`. Согласуйте события с участниками №1 и №7 до слияния PR. Исходный командный репозиторий здесь не изменялся.

## Минимальный клиент

```ts
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001');
socket.on('room:state', console.log);
socket.on('game:snapshot', console.log);
socket.on('player:private-state', console.log); // private role/tasks
socket.on('action:rejected', console.error);
socket.emit('room:create', { name: 'Alice' }, console.log);
// Other clients: socket.emit('room:join',{code:'ABC123',name:'Bob'},console.log)
// Other clients: socket.emit('player:ready',{ready:true},console.log)
// Host: socket.emit('game:start',{},console.log)
```

Все события и payload в [docs/socket-events.md](docs/socket-events.md). Общие типы в [shared/types/contracts.ts](shared/types/contracts.ts).

## Что реализовано

- Комнаты 6 символов, уникальные имена, 4–10 игроков, готовность, смена хоста при отключении
- Запуск только хостом, 1 предатель для 4–6 и 2 для 7–10 игроков, конфиденциальные роли
- Фазы `lobby → playing → meeting (45s) → voting (30s) → playing/ended`, сброс в lobby
- Серверное движение с ограничением скорости, границ и стен; GET /map
- Два задания на игрока, проверка близости и времени выполнения, прогресс
- Убийство и cooldown 20 секунд, тело, репорт, одно голосование на живого, Skip и ничья
- Проверка победы и обработка отключений, safe errors и payload validation

## Ограничения

Это **серверный MVP**, не полный клиент игры. Нет графики, UI, постоянной БД или восстановления сессий после отключения. Текущее движение и прохождение заданий преднамеренно упрощены для команды. Состояние комнат пропадает при перезапуске. Перед публичным использованием нужны более строгие rate limits, нагрузочные тесты, авторизация/сессии и защита от злоупотреблений.
