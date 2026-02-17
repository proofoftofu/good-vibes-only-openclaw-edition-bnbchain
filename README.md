# Relic Run: Dungeon Under Rewrite (BSC Testnet)

## Description
Relic Run is a browser mini-game where an AI Dungeon Master (DM) mutates arena difficulty and layout in short phases. Every mutation is committed onchain first through `DungeonStateCommit`, then applied by the arena server only when the corresponding committed version is observed.

This creates a verifiable loop:
1. DM agent proposes bounded mutation.
2. DM submits `commitMutation` tx on BSC testnet.
3. Server watches `MutationCommitted` event and applies only the next monotonic version.
4. Players instantly see the dungeon update and can inspect tx hash.

## Benefit
- Verifiable fairness: no hidden server-only rule edits.
- Strong Agent x Onchain Actions story: AI agent executes blockchain transactions, not just chat output.
- Judge-friendly demo: clear visual cause/effect from tx hash to gameplay mutation in seconds.

## How It Works
### Smart contracts (`contracts/`)
- `AgentRegistry.sol`
  - register/update DM agent metadata by owner.
- `ArenaRegistry.sol`
  - create arena linked to agent, swap active agent.
- `DungeonStateCommit.sol`
  - commit one of allowed mutation types:
    - `SET_HAZARD_RATE`
    - `SET_ENEMY_SPEED`
    - `SET_LOOT_MULTIPLIER`
    - `PATCH_TILES`
    - `ADVANCE_ALTITUDE`
  - enforces owner-based authorization and monotonic `versionId`.

### Arena server (`server/`)
- Express + WebSocket runtime.
- Watches `MutationCommitted` on BSC testnet via `viem`.
- Decodes committed mutation data and validates against bounded schema.
- Applies mutation only if `(arenaId, versionId)` is exactly next expected version.
- Broadcasts tx hash + updated state to clients.

### DM Agent service (`server/src/agent/dmAgent.ts`)
Implements requested interface:
- `get_arena_context(arenaId)`
- `propose_mutation(arenaId)`
- `commit_mutation(arenaId, mutationType, mutationData)`
- `announce_change(arenaId, message)`

### Web client (`web/`)
- React HUD + Three.js 3D survival arena inspired by elimination party games.
- Landing page explains the game loop and AI-managed dungeon updates before entering gameplay.
- Mechanics: complex multi-level map, moving platforms, sweepers, bumpers, falling blocks, jump + dash movement.
- Physics-first elimination: no HP system; collisions apply knockback and players are eliminated when they fall off-map.
- Chaos pacing inspired by `chaos-arena-public`:
  - timed arena shrink events
  - periodic hazard-wave spawns
  - low-gravity trick windows
- Objective: survive as long as possible; no relic collection and no finish goal.
- On-chain state impact:
  - `SET_HAZARD_RATE` -> arena danger pressure and obstacle damage
  - `SET_ENEMY_SPEED` -> sweeper/bumper motion speed
  - `SET_LOOT_MULTIPLIER` -> survival score scaling
  - `PATCH_TILES` -> extra trap objects/distractions mapped into arena
- Optional admin action button for manual mutation commit (can be disabled in agent mode).
- Real-time mutation updates over websocket (tx hash and new versioned state).

## How To Run
### 1) Install dependencies
From `workspace/`:
```bash
npm install
```

### 2) Configure environment
Create `workspace/.env` (copy from `.env.example`):
```env
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
PRIVATE_KEY=0x...
DUNGEON_COMMIT_ADDRESS=0x...
VITE_BSC_TESTNET_CHAIN_ID=97
VITE_ARENA_ID=1
AGENT_AUTOCOMMIT_ENABLED=true
AGENT_AUTOCOMMIT_INTERVAL_MS=25000
AGENT_AUTOCOMMIT_STARTUP_DELAY_MS=7000
AGENT_AUTOCOMMIT_ARENAS=1
VITE_AGENT_MODE=true
```

### 3) Deploy contracts to BSC testnet
```bash
npm run deploy:bsc-testnet --workspace contracts
```
Deployment output is written to:
- `contracts/deployments/bscTestnet.json`

Set `DUNGEON_COMMIT_ADDRESS` from this output in `.env`.

### 4) Register DM agent and create arena (required once)
```bash
npm run bootstrap:bsc-testnet --workspace contracts
```
This writes:
- `contracts/deployments/bootstrap.bscTestnet.json`

Set `VITE_ARENA_ID` in `.env` from the generated `arenaId`.

### 5) Start backend and frontend
Run in two terminals (recommended):
```bash
npm run dev --workspace server
npm run dev --workspace web
```

- Server: `http://localhost:8787`
- Web: `http://localhost:5173`

### Agent-based commit mode (OpenClaw style)
- Set `AGENT_AUTOCOMMIT_ENABLED=true` to let the server AI agent commit mutations automatically.
- `AGENT_AUTOCOMMIT_INTERVAL_MS` controls commit cadence.
- `AGENT_AUTOCOMMIT_ARENAS` accepts comma-separated arena IDs.
- Set `VITE_AGENT_MODE=true` to hide manual commit button in the UI.

### External LLM agent mode (Chaos Arena style)
The server exposes a self-documenting skill endpoint and primitive agent commands:

- `GET /skill.md`
- `GET /arena/:arenaId/agent/context`
- `POST /arena/:arenaId/agent/command`

This lets OpenClaw (or any LLM runner) poll context, decide mutation, and submit command-driven commits.

Run the bundled OpenClaw loop:
```bash
npm run agent:openclaw
```

Recommended when using external LLM loop:
- set `AGENT_AUTOCOMMIT_ENABLED=false` (avoid competing with server timer loop)
- keep `VITE_AGENT_MODE=true` (UI is read-only game view + status)

If `AGENT_API_KEY` is set in `.env`, include it as:
```bash
X-Agent-API-Key: <AGENT_API_KEY>
```

### 6) Demo script
1. Deploy contracts and set `DUNGEON_COMMIT_ADDRESS`.
2. Run bootstrap script and set `VITE_ARENA_ID`.
3. Open web app, read landing page, and click `Start Game`.
4. Move with `WASD/Arrow`, jump with `Space`, dash with `Shift`.
5. Wait for agent commits (server auto mode or external OpenClaw runner).
6. Observe versioned on-chain mutation changing obstacle speed, danger pressure, and map distractions.

## Scope Notes (MVP)
- Single game mode (`Dungeon Sprint`) with one arena template.
- One mutation commit window per phase.
- Bounded mutation catalog only (no arbitrary remote code execution).
- Focused on submission reproducibility and judge-verifiable onchain linkage.
