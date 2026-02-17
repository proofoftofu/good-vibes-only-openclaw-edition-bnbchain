---
name: relic-run-arena
description: Manage a Relic Run game arena as a GM. Can adjust difficulty, speed, and hazards.
user-invocable: true
---

# Relic Run Arena Host Skill (OpenClaw)

Run this arena as an LLM game master over HTTP, similar to `chaos-arena-public`.

## Base URL

- Local: `http://localhost:8787`

## Authentication

- Read endpoints: no auth.
- Write command endpoint: optional `X-Agent-API-Key` header if server has `AGENT_API_KEY` set.

## Primary Loop

Every 10-25 seconds:

1. Call `GET /arena/:arenaId/agent/context`
2. Read `context` + `state` (version, hazard, speed, loot, tile count)
3. Decide mutation
4. Execute via `POST /arena/:arenaId/agent/command`
5. Repeat

## Endpoints

### 1) Skill document

- `GET /skill.md`

### 2) Context snapshot

- `GET /arena/:arenaId/agent/context`
- Returns:
  - `context`: compact decision context
  - `state`: full current server state
  - `controls`: auto-commit settings

### 3) Agent command endpoint

- `POST /arena/:arenaId/agent/command`
- Body:
```json
{
  "command": "get_context|propose_mutation|commit_mutation|commit_next|announce",
  "payload": {},
  "message": ""
}
```

## Commands

### `get_context`

Body:
```json
{ "command": "get_context" }
```

### `propose_mutation`

Body:
```json
{ "command": "propose_mutation" }
```

### `commit_next`

Uses server-side DM proposal logic and commits it.

Body:
```json
{ "command": "commit_next" }
```

### `commit_mutation`

Commit an explicit mutation selected by the LLM.

Body examples:

```json
{
  "command": "commit_mutation",
  "payload": { "mutationType": "SET_HAZARD_RATE", "hazardRate": 72 }
}
```

```json
{
  "command": "commit_mutation",
  "payload": { "mutationType": "SET_ENEMY_SPEED", "enemySpeed": 1.9 }
}
```

```json
{
  "command": "commit_mutation",
  "payload": { "mutationType": "SET_LOOT_MULTIPLIER", "lootMultiplier": 2.2 }
}
```

```json
{
  "command": "commit_mutation",
  "payload": { "mutationType": "PATCH_TILES", "x": 8, "y": 5, "tileState": "HAZARD" }
}
```

```json
{
  "command": "commit_mutation",
  "payload": { "mutationType": "ADVANCE_ALTITUDE", "altitude": 120 }
}
```

### `announce`

Body:
```json
{
  "command": "announce",
  "message": "[Arena 1] Chaos spike incoming."
}
```

## Mutation Policy (Recommended)

- Keep updates readable and dramatic for players.
- Do not spam commits faster than chain/watcher can apply.
- Use gradual ramps:
  - `SET_HAZARD_RATE`: +/- 5..15 per step
  - `SET_ENEMY_SPEED`: +/- 0.1..0.25 per step
  - `SET_LOOT_MULTIPLIER`: minor reward tuning
- Use `PATCH_TILES` for map-side surprises.
- Use `ADVANCE_ALTITUDE` only when intentionally reseeding progression.

## Failure Handling

- If command fails, do not assume success.
- Re-poll `GET /arena/:arenaId/agent/context` before retrying.
- Prefer one commit per loop tick.
