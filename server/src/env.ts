import { z } from "zod";
import "./loadEnv.js";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  DUNGEON_COMMIT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  AGENT_AUTOCOMMIT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true"),
  AGENT_AUTOCOMMIT_INTERVAL_MS: z.coerce.number().int().min(4000).default(25000),
  AGENT_AUTOCOMMIT_STARTUP_DELAY_MS: z.coerce.number().int().min(0).default(7000),
  AGENT_AUTOCOMMIT_ARENAS: z.string().default("1")
});

export const env = envSchema.parse({
  PORT: process.env.PORT,
  DUNGEON_COMMIT_ADDRESS: process.env.DUNGEON_COMMIT_ADDRESS || process.env.VITE_DUNGEON_COMMIT_ADDRESS,
  AGENT_AUTOCOMMIT_ENABLED: process.env.AGENT_AUTOCOMMIT_ENABLED,
  AGENT_AUTOCOMMIT_INTERVAL_MS: process.env.AGENT_AUTOCOMMIT_INTERVAL_MS,
  AGENT_AUTOCOMMIT_STARTUP_DELAY_MS: process.env.AGENT_AUTOCOMMIT_STARTUP_DELAY_MS,
  AGENT_AUTOCOMMIT_ARENAS: process.env.AGENT_AUTOCOMMIT_ARENAS
});
