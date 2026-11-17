# Контракты Socket.IO

Контракты типизированы в `shared/src/index.ts`. Команда подтверждается callback последним аргументом. Команды без payload принимают только callback. Высокочастотный `player:move` допускает отправку без callback.

```ts
type GameAck<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: ErrorCode; message: string };
```

## Клиент → сервер

| Событие | Payload | Успешный `data` и проверки |
| --- | --- | --- |
| `room:create` | `{ playerName }` | `{ room, playerId }`. Имя 2–20 символов, новый шестисимвольный код. |
| `room:join` | `{ roomCode, playerName }` | `{ room, playerId }`. Лобби существует, есть место, имя уникально без учёта регистра. |
| `room:leave` | — | `null`. Удаление игрока, передача хоста и завершение матча при выполнении условий победы. |
| `player:ready` | `{ ready: boolean }` | `null`. Своя готовность в лобби. |
| `game:start` | — | `null`. Хост в лобби, допустимый состав, готовность гостей. |
| `player:move` | `{ up, down, left, right, sequence }` | `null`. Живой игрок в `playing`, булевы флаги, целый возрастающий `sequence`, ограничение частоты. |
| `task:interact` | `{ taskId }` | `TaskChallenge`. Живой владелец незавершённого задания в радиусе панели. Возвращает токен и порядок проводов или длительность заправки. |
| `task:complete` | `{ taskId, proof }` | `null`. Текущий токен, та же панель, правильное решение или достаточное время, однократное завершение. |
| `player:kill` | `{ targetId }` | `null`. Живой предатель, живая мирная цель, допустимая дистанция, истёкший кулдаун. |
| `body:report` | `{ bodyId }` | `null`. Живой игрок рядом с телом в `playing`. Фаза сразу меняется на `meeting`. |
| `vote:cast` | `{ targetId: string \| null }` | `null`. Один голос живого участника в `voting` за живого игрока или Skip (`null`). |
| `game:return` | — | `null`. Возврат всей комнаты из `ended` в `lobby`. Повторный запрос в лобби идемпотентен. |

`TaskProof` для Wires содержит `{ kind: "wires", token, connections: number[] }`, где индекс слева соответствует индексу контакта справа. Для Fuel используется `{ kind: "fuel", token }`.

## Сервер → клиент

| Событие | Аудитория | Payload |
| --- | --- | --- |
| `room:state` | Комната | `RoomState`: фаза, состав, общее число завершённых/назначенных задач, номер раунда, таймер, последний итог голосования и итог игры при наличии. |
| `game:snapshot` | Комната | `GameSnapshot`: фаза, раунд, серверное время в мс, позиции, последние принятые `sequence`, тела. |
| `player:private-state` | Один сокет | `PrivateState`: своя роль и задания, время доступности Kill, отметка о собственном голосе. |
| `task:progress` | Комната | `{ completed, total }` при завершении задания. |
| `meeting:started` | Комната | `{ reporter, deadline }`. |
| `vote:result` | Комната | `VoteResult`: итог, исключённый игрок при наличии, подсчитанные голоса и Skip после закрытия бюллетеня. |
| `game:ended` | Комната | `GameResult`: победитель, причина, роли и финальный состав. |

Таймеры передаются абсолютными метками времени в мс. До `ended` в общих событиях нет ролей. Во время голосования сервер сообщает о подаче голоса только проголосовавшему игроку.

## Ошибки

`INVALID_PAYLOAD`, `INVALID_NAME`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `NAME_TAKEN`, `ALREADY_IN_ROOM`, `MATCH_ALREADY_STARTED`, `NOT_HOST`, `INVALID_PLAYER_COUNT`, `PLAYERS_NOT_READY`, `WRONG_PHASE`, `PLAYER_DEAD`, `NOT_IMPOSTOR`, `INVALID_TARGET`, `TOO_FAR`, `COOLDOWN`, `INVALID_TASK`, `ALREADY_VOTED`, `RATE_LIMIT`, `INTERNAL_ERROR`. Acknowledgment возвращает безопасное сообщение для игрока.
