import { decodeAbiParameters, parseAbiParameters } from "viem";
import { MutationPayload, MutationType } from "../types/mutation.js";

const types: MutationType[] = [
  "SET_HAZARD_RATE",
  "SET_ENEMY_SPEED",
  "SET_LOOT_MULTIPLIER",
  "PATCH_TILES",
  "ADVANCE_ALTITUDE"
];

export function mutationTypeFromIndex(index: number): MutationType {
  const value = types[index];
  if (!value) {
    throw new Error(`unknown-mutation-type: ${index}`);
  }
  return value;
}

export function decodeMutationData(mutationType: MutationType, mutationData: `0x${string}`): MutationPayload {
  if (mutationType === "SET_HAZARD_RATE") {
    const [hazardRate] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    return { mutationType, hazardRate: Number(hazardRate) };
  }

  if (mutationType === "SET_ENEMY_SPEED") {
    const [enemySpeedBps] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    return { mutationType, enemySpeed: Number(enemySpeedBps) / 100 };
  }

  if (mutationType === "SET_LOOT_MULTIPLIER") {
    const [lootMultiplierBps] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    return { mutationType, lootMultiplier: Number(lootMultiplierBps) / 100 };
  }

  if (mutationType === "ADVANCE_ALTITUDE") {
    const [altitude] = decodeAbiParameters(parseAbiParameters("uint32"), mutationData);
    return { mutationType, altitude: Number(altitude) };
  }

  const [x, y, tileState] = decodeAbiParameters(parseAbiParameters("uint8, uint8, uint8"), mutationData);
  return {
    mutationType,
    x: Number(x),
    y: Number(y),
    tileState: Number(tileState) === 0 ? "OPEN" : Number(tileState) === 1 ? "BLOCKED" : "HAZARD"
  };
}
