# Контракты Socket.IO

Общие типы находятся в `shared/src/index.ts`. Все команды комнаты используют acknowledgment. Ошибки имеют безопасные `errorCode` и `message` без stack trace.

## Реализовано

### `room:create`

Клиент → сервер: `{ playerName: string }`.

Проверки: 2–20 символов, допустимые буквы/цифры/пробел/`_`/`-`. Сервер создаёт код и делает инициатора хостом.

### `room:join`

Клиент → сервер: `{ playerName: string, roomCode: string }`.

Проверки: комната существует, меньше 10 игроков, имя уникально без учёта регистра.

### Acknowledgment комнат

Успех: `{ ok: true, room: RoomState, playerId: string }`.

Ошибка: `{ ok: false, errorCode: string, message: string }`.

Коды: `INVALID_NAME`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `NAME_TAKEN`, `CODE_GENERATION_FAILED`, `INTERNAL_ERROR`.

### `room:state`

Сервер → комната: публичный `RoomState` после входа и выхода. Не должен содержать секретные роли.

### `player:move`

Клиент → сервер: `{ up, down, left, right: boolean, sequence: number }`. Сервер вычисляет координаты, ограничивает шаг, границы и препятствия.

### `game:snapshot`

Сервер → комната: текущий `RoomState` после принятого движения. В следующем Sprint снимок будет отделён от состояния лобби и дополнен `serverTime`/последовательностью.

## Запланировано

| Событие | Направление | Основная проверка |
|---|---|---|
| `player:ready` | C→S | только свой статус, lobby |
| `game:start` | C→S | хост, 4–10 игроков |
| `player:private-state` | S→C | роль и задания одному сокету |
| `task:interact` | C→S | владелец, дистанция, playing |
| `task:complete` | C→S | назначение, повтор, дистанция |
| `player:kill` | C→S | роль, жизнь, цель, дистанция, cooldown |
| `body:report` | C→S | тело существует, рядом, не репортилось |
| `meeting:started` | S→room | публичный таймер и тело |
| `vote:cast` | C→S | living, voting, один раз |
| `vote:result` | S→room | итог без промежуточной утечки голосов |
| `game:ended` | S→room | победитель и причина |

Изменение события начинается с этого документа и `shared`, затем обновляются обе стороны и тесты.
