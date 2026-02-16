import { z } from "zod";
import "./loadEnv.js";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  DUNGEON_COMMIT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  DUNGEON_COMMIT_ADDRESS: process.env.DUNGEON_COMMIT_ADDRESS || process.env.VITE_DUNGEON_COMMIT_ADDRESS
});
