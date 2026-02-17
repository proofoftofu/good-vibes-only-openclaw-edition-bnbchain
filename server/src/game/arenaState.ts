import { MutationPayload } from "../types/mutation.js";

export interface ReplayRound {
  roundId: string;
  startVersion: number;
  endVersion: number;
  score: number;
  deathCause: string;
}

export interface ArenaState {
  arenaId: number;
  versionId: number;
  baseAltitude: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: Map<string, "OPEN" | "BLOCKED" | "HAZARD">;
  replayLog: ReplayRound[];
  updatedAt: string;
}

export function createArenaState(arenaId: number): ArenaState {
  return {
    arenaId,
    versionId: 0,
    baseAltitude: 0,
    hazardRate: 30,
    enemySpeed: 1,
    lootMultiplier: 1,
    tiles: new Map(),
    replayLog: [],
    updatedAt: new Date().toISOString()
  };
}

export function applyMutation(state: ArenaState, mutation: MutationPayload, versionId: number): ArenaState {
  state.versionId = versionId;

  if (mutation.mutationType === "SET_HAZARD_RATE") {
    state.hazardRate = mutation.hazardRate;
  } else if (mutation.mutationType === "SET_ENEMY_SPEED") {
    state.enemySpeed = mutation.enemySpeed;
  } else if (mutation.mutationType === "SET_LOOT_MULTIPLIER") {
    state.lootMultiplier = mutation.lootMultiplier;
  } else if (mutation.mutationType === "ADVANCE_ALTITUDE") {
    state.baseAltitude = mutation.altitude;
  } else {
    state.tiles.set(`${mutation.x}:${mutation.y}`, mutation.tileState);
  }

  state.updatedAt = new Date().toISOString();
  return state;
}
