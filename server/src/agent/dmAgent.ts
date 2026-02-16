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
    const phase = context.currentVersion % 4;

    if (phase === 0) {
      return {
        payload: { mutationType: "SET_HAZARD_RATE", hazardRate: 35 },
        rationale: "Open with moderate pressure so players can still route to relic zones."
      };
    }

    if (phase === 1) {
      return {
        payload: { mutationType: "SET_ENEMY_SPEED", enemySpeed: 1.2 },
        rationale: "Increase chase intensity entering Pressure phase."
      };
    }

    if (phase === 2) {
      return {
        payload: { mutationType: "SET_LOOT_MULTIPLIER", lootMultiplier: 1.4 },
        rationale: "Offer risk-reward before collapse to keep runs tense."
      };
    }

    return {
      payload: { mutationType: "PATCH_TILES", x: 10, y: 6, tileState: "HAZARD" },
      rationale: "Force pathing adaptation near extraction corridor."
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

  async runMutationTurn(arena: ArenaState): Promise<AgentActionResult> {
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

  const tileState = payload.tileState === "OPEN" ? 0 : payload.tileState === "BLOCKED" ? 1 : 2;
  return {
    mutationTypeIndex: 3,
    mutationData: encodeAbiParameters(parseAbiParameters("uint8, uint8, uint8"), [payload.x, payload.y, tileState])
  };
}
