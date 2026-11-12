# Socket.IO API — контракт MVP

Server URL: `http://localhost:3001`, Socket.IO v4. Все события client → server используют ack:

- success: `{ "ok": true, "data": {} }`
- error: `{ "ok": false, "errorCode": "WRONG_PHASE" }`

| Client event | Payload | Result |
|---|---|---|
| `room:create` | `{name}` | `{code, playerId}` |
| `room:join` | `{code, name}` | `{code, playerId}` |
| `room:leave` | `{}` | `{}` |
| `player:ready` | `{ready: boolean}` | `{}` |
| `game:start` | `{}` | `{}` |
| `game:reset` | `{}` | `{}` (only host, ended) |
| `player:move` | `{dx, dy}` each 35–100ms, values -1..1 | `{}` |
| `task:interact` | `{taskId}` | `{}` |
| `task:complete` | `{taskId}` after >=1.2s | `{}` |
| `player:kill` | `{targetId}` | `{}` |
| `body:report` | `{bodyId}` | `{}` |
| `vote:cast` | `{targetId: string \| null}`; null means skip | `{}` |

Server → client: `room:state`, `player:joined`, `player:left`, `game:started`, `player:private-state` (only owner), `game:snapshot`, `task:progress`, `meeting:started`, `voting:started`, `vote:result`, `game:ended`, `action:rejected`.

Room code length 6, names 2..20, 4–10 players. Only host can start; all non-host players must be ready. `player:private-state` is confidential; do not broadcast it. A new match uses `game:reset` then ready/start. No session reconnect: disconnect removes member; reconnect joins as a new client only while lobby.

Map: `GET /map` returns `{width,height,spawn,walls}`. Coordinates and task positions are pixels. Server sends `game:snapshot` after movement and significant actions.
