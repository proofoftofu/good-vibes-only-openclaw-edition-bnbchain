import { applyMutation, createArenaState, type ArenaState } from "./arenaState.js";
import { MutationPayload } from "../types/mutation.js";

export class ArenaStore {
  private readonly states = new Map<number, ArenaState>();

  getOrCreate(arenaId: number): ArenaState {
    const existing = this.states.get(arenaId);
    if (existing) {
      return existing;
    }

    const created = createArenaState(arenaId);
    this.states.set(arenaId, created);
    return created;
  }

  applyCommittedMutation(arenaId: number, versionId: number, payload: MutationPayload): ArenaState {
    const arena = this.getOrCreate(arenaId);

    if (versionId !== arena.versionId + 1) {
      throw new Error(`non-monotonic-version: expected=${arena.versionId + 1}, got=${versionId}`);
    }

    return applyMutation(arena, payload, versionId);
  }

  list(): ArenaState[] {
    return [...this.states.values()];
  }
}
