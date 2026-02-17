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
  - commit one of four allowed mutation types:
    - `SET_HAZARD_RATE`
    - `SET_ENEMY_SPEED`
    - `SET_LOOT_MULTIPLIER`
    - `PATCH_TILES`
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
- React HUD + Phaser arena canvas with single-player extraction loop.
- Mechanics: chase enemies, dynamic hazard spawns, shard collection economy, dash cooldown, extraction gate.
- On-chain state impact:
  - `SET_HAZARD_RATE` -> hazard pressure and spawn target
  - `SET_ENEMY_SPEED` -> hunter movement speed
  - `SET_LOOT_MULTIPLIER` -> shard score value
  - `PATCH_TILES` -> blocked/hazard tile overlays in map
- Wallet connection via wagmi/viem.
- Admin action button for committing next DM mutation.
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

### 6) Demo script
1. Deploy contracts and set `DUNGEON_COMMIT_ADDRESS`.
2. Run bootstrap script and set `VITE_ARENA_ID`.
3. Open web app and connect wallet on BSC testnet.
4. Click `Start Run`, collect shards, avoid hunters/hazards, and extract before collapse.
5. Click `Commit Next Mutation` during a run.
6. Observe versioned on-chain mutation visibly changing pressure, speed, loot value, or patched tiles.

## Scope Notes (MVP)
- Single game mode (`Dungeon Sprint`) with one arena template.
- One mutation commit window per phase.
- Bounded mutation catalog only (no arbitrary remote code execution).
- Focused on submission reproducibility and judge-verifiable onchain linkage.
