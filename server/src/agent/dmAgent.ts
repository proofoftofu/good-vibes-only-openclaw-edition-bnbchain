import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";
import { dungeonStateCommitAbi } from "../chain/abi.js";
import { getWalletClient, publicClient } from "../chain/client.js";
import { mutationPayloadSchema, type MutationPayload } from "../types/mutation.js";
import type { ArenaState } from "../game/arenaState.js";

export interface ArenaContext {
  arenaId: number;
  playerCount: number;
  avgSurvivalTime: number;
  currentVersion: number;
  cooldownSeconds: number;
}

export interface AgentActionResult {
  txHash: Hex;
  payload: MutationPayload;
  rationale: string;
}

export class DmAgentService {
  constructor(private readonly dungeonCommitAddress: Hex) {}

  get_arena_context(arena: ArenaState): ArenaContext {
    return {
      arenaId: arena.arenaId,
      playerCount: 1,
      avgSurvivalTime: 42,
      currentVersion: arena.versionId,
      cooldownSeconds: 20
    };
  }

  propose_mutation(context: ArenaContext): { payload: MutationPayload; rationale: string } {
    const phase = context.currentVersion % 6;
    const pressure = Math.min(100, 35 + context.currentVersion * 4);

    if (phase === 0) {
      return {
        payload: { mutationType: "SET_HAZARD_RATE", hazardRate: Math.min(88, pressure) },
        rationale: "Escalate arena pressure to force movement and deny safe camping."
      };
    }

    if (phase === 1) {
      return {
        payload: { mutationType: "SET_ENEMY_SPEED", enemySpeed: Math.min(2.3, 1 + context.currentVersion * 0.08) },
        rationale: "Increase obstacle speed for survival-chaos pacing."
      };
    }

    if (phase === 2) {
      return {
        payload: { mutationType: "PATCH_TILES", x: 5 + (context.currentVersion % 8), y: 3 + (context.currentVersion % 10), tileState: "HAZARD" },
        rationale: "Inject a new trap lane to reshape safe routes."
      };
    }

    if (phase === 3) {
      return {
        payload: { mutationType: "PATCH_TILES", x: 2 + (context.currentVersion % 16), y: 2 + ((context.currentVersion * 3) % 15), tileState: "BLOCKED" },
        rationale: "Block a previously reliable lane and force adaptive movement."
      };
    }

    if (phase === 4) {
      return {
        payload: { mutationType: "SET_HAZARD_RATE", hazardRate: Math.min(96, pressure + 8) },
        rationale: "Trigger hazard-wave conditions for a mid-run intensity spike."
      };
    }

    return {
      payload: { mutationType: "SET_LOOT_MULTIPLIER", lootMultiplier: Math.min(3, 1.2 + context.currentVersion * 0.05) },
      rationale: "Scale score multiplier with risk so longer survival remains rewarding."
    };
  }

  async commit_mutation(arenaId: number, payload: MutationPayload): Promise<Hex> {
    mutationPayloadSchema.parse(payload);

    const { mutationTypeIndex, mutationData } = encodeMutation(payload);
    const versionHash = keccak256(mutationData);

    const walletClient = getWalletClient();
    const hash = await walletClient.writeContract({
      address: this.dungeonCommitAddress,
      abi: dungeonStateCommitAbi,
      functionName: "commitMutation",
      args: [BigInt(arenaId), mutationTypeIndex, mutationData, versionHash],
      chain: walletClient.chain
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  announce_change(arenaId: number, message: string): string {
    return `[Arena ${arenaId}] ${message}`;
  }

  async runMutationTurn(arena: ArenaState, requestedAltitude?: number): Promise<AgentActionResult> {
    if (Number.isFinite(requestedAltitude)) {
      const altitude = Math.max(0, Math.floor(requestedAltitude as number));
      const payload: MutationPayload = { mutationType: "ADVANCE_ALTITUDE", altitude };
      const txHash = await this.commit_mutation(arena.arenaId, payload);
      return {
        txHash,
        payload,
        rationale: `Advance map generation baseline to altitude ${altitude}.`
      };
    }

    const context = this.get_arena_context(arena);
    const { payload, rationale } = this.propose_mutation(context);
    const txHash = await this.commit_mutation(arena.arenaId, payload);
    return { txHash, payload, rationale };
  }
}

function encodeMutation(payload: MutationPayload): { mutationTypeIndex: number; mutationData: Hex } {
  if (payload.mutationType === "SET_HAZARD_RATE") {
    return {
      mutationTypeIndex: 0,
      mutationData: encodeAbiParameters(parseAbiParameters("uint16"), [payload.hazardRate])
    };
  }

  if (payload.mutationType === "SET_ENEMY_SPEED") {
    return {
      mutationTypeIndex: 1,
      mutationData: encodeAbiParameters(parseAbiParameters("uint16"), [Math.round(payload.enemySpeed * 100)])
    };
  }

  if (payload.mutationType === "SET_LOOT_MULTIPLIER") {
    return {
      mutationTypeIndex: 2,
      mutationData: encodeAbiParameters(parseAbiParameters("uint16"), [Math.round(payload.lootMultiplier * 100)])
    };
  }

  if (payload.mutationType === "ADVANCE_ALTITUDE") {
    return {
      mutationTypeIndex: 4,
      mutationData: encodeAbiParameters(parseAbiParameters("uint32"), [payload.altitude])
    };
  }

  const tileState = payload.tileState === "OPEN" ? 0 : payload.tileState === "BLOCKED" ? 1 : 2;
  return {
    mutationTypeIndex: 3,
    mutationData: encodeAbiParameters(parseAbiParameters("uint8, uint8, uint8"), [payload.x, payload.y, tileState])
  };
}
