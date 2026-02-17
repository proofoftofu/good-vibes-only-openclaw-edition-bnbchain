import { z } from "zod";

export const mutationTypes = [
  "SET_HAZARD_RATE",
  "SET_ENEMY_SPEED",
  "SET_LOOT_MULTIPLIER",
  "PATCH_TILES",
  "ADVANCE_ALTITUDE"
] as const;

export type MutationType = (typeof mutationTypes)[number];

const bounds = {
  hazardRate: z.number().min(0).max(100),
  enemySpeed: z.number().min(0.5).max(2.5),
  lootMultiplier: z.number().min(0.5).max(3),
  tileState: z.enum(["OPEN", "BLOCKED", "HAZARD"])
};

export const mutationPayloadSchema = z.discriminatedUnion("mutationType", [
  z.object({
    mutationType: z.literal("SET_HAZARD_RATE"),
    hazardRate: bounds.hazardRate
  }),
  z.object({
    mutationType: z.literal("SET_ENEMY_SPEED"),
    enemySpeed: bounds.enemySpeed
  }),
  z.object({
    mutationType: z.literal("SET_LOOT_MULTIPLIER"),
    lootMultiplier: bounds.lootMultiplier
  }),
  z.object({
    mutationType: z.literal("PATCH_TILES"),
    x: z.number().int().min(0).max(19),
    y: z.number().int().min(0).max(19),
    tileState: bounds.tileState
  }),
  z.object({
    mutationType: z.literal("ADVANCE_ALTITUDE"),
    altitude: z.number().int().min(0).max(1000000)
  })
]);

export type MutationPayload = z.infer<typeof mutationPayloadSchema>;
