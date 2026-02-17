import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import { createServer } from "http";
import { getContract, type Hex } from "viem";
import { env } from "./env.js";
import { ArenaStore } from "./game/arenaStore.js";
import { DmAgentService } from "./agent/dmAgent.js";
import { watchMutations } from "./chain/watcher.js";
import { WsHub } from "./wsHub.js";
import { dungeonStateCommitAbi } from "./chain/abi.js";
import { publicClient } from "./chain/client.js";
import { decodeMutationData, mutationTypeFromIndex } from "./chain/decode.js";
import { mutationPayloadSchema } from "./types/mutation.js";

const app = express();
app.use(cors());
app.use(express.json());

const arenaStore = new ArenaStore();
const dmAgent = new DmAgentService(env.DUNGEON_COMMIT_ADDRESS as Hex);
const dungeonCommitContract = getContract({
  address: env.DUNGEON_COMMIT_ADDRESS as Hex,
  abi: dungeonStateCommitAbi,
  client: publicClient
});

const httpServer = createServer(app);
const wsHub = new WsHub(httpServer);
const autoCommitArenaIds = env.AGENT_AUTOCOMMIT_ARENAS.split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
const autoCommitInFlight = new Set<number>();
const skillDocPath = new URL("../../openclaw/SKILL.md", import.meta.url);

const parseArenaId = (value: string): number | null => {
  const arenaId = Number(value);
  return Number.isInteger(arenaId) && arenaId > 0 ? arenaId : null;
};

const requireAgentApiKey: express.RequestHandler = (req, res, next) => {
  if (!env.AGENT_API_KEY) {
    next();
    return;
  }
  const provided = req.header("x-agent-api-key");
  if (provided !== env.AGENT_API_KEY) {
    res.status(401).json({ error: "unauthorized-agent" });
    return;
  }
  next();
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/arena/:arenaId", (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);

  res.json({
    ...arena,
    tiles: [...arena.tiles.entries()]
  });
});

app.get("/arena/:arenaId/context", (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);
  res.json(dmAgent.get_arena_context(arena));
});

app.post("/arena/:arenaId/propose", (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);
  res.json(dmAgent.propose_mutation(dmAgent.get_arena_context(arena)));
});

app.post("/arena/:arenaId/commit", async (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);
  const requestedAltitude = typeof req.body?.altitude === "number" ? req.body.altitude : undefined;
  console.log(`[commit] request received arena=${arenaId} currentVersion=${arena.versionId}`);

  try {
    const action = await dmAgent.runMutationTurn(arena, requestedAltitude);
    console.log(
      `[commit] tx confirmed arena=${arenaId} mutation=${action.payload.mutationType} txHash=${action.txHash}`
    );
    const announcement = dmAgent.announce_change(
      arenaId,
      `${action.payload.mutationType} committed (${action.txHash})`
    );

    wsHub.broadcast({ type: "announcement", arenaId, message: announcement });
    res.json(action);
  } catch (error) {
    console.error(`[commit] failed arena=${arenaId}`, error);
    res.status(500).json({ error: "failed-to-commit-mutation" });
  }
});

app.get("/skill.md", (_req, res) => {
  try {
    const markdown = readFileSync(skillDocPath, "utf8");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.status(200).send(markdown);
  } catch {
    res.status(404).send("# Skill Not Found\n\nMissing `openclaw/SKILL.md`.");
  }
});

app.get("/arena/:arenaId/agent/context", (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);
  res.json({
    context: dmAgent.get_arena_context(arena),
    state: {
      ...arena,
      tiles: [...arena.tiles.entries()]
    },
    controls: {
      autoCommitEnabled: env.AGENT_AUTOCOMMIT_ENABLED,
      autoCommitIntervalMs: env.AGENT_AUTOCOMMIT_INTERVAL_MS
    }
  });
});

app.post("/arena/:arenaId/agent/command", requireAgentApiKey, async (req, res) => {
  const arenaId = parseArenaId(req.params.arenaId);
  if (!arenaId) {
    res.status(400).json({ error: "invalid-arena-id" });
    return;
  }
  const arena = arenaStore.getOrCreate(arenaId);
  const command = String(req.body?.command || "");

  try {
    if (command === "get_context") {
      res.json({
        ok: true,
        result: {
          context: dmAgent.get_arena_context(arena),
          state: {
            ...arena,
            tiles: [...arena.tiles.entries()]
          }
        }
      });
      return;
    }

    if (command === "propose_mutation") {
      const proposal = dmAgent.propose_mutation(dmAgent.get_arena_context(arena));
      res.json({ ok: true, result: proposal });
      return;
    }

    if (command === "commit_mutation") {
      const payloadRaw = req.body?.payload;
      if (!payloadRaw) {
        res.status(400).json({ ok: false, error: "payload-required" });
        return;
      }
      const payload = mutationPayloadSchema.parse(payloadRaw);
      const txHash = await dmAgent.commit_mutation(arenaId, payload);
      wsHub.broadcast({
        type: "announcement",
        arenaId,
        message: dmAgent.announce_change(arenaId, `${payload.mutationType} committed (${txHash})`)
      });
      res.json({ ok: true, result: { txHash, payload } });
      return;
    }

    if (command === "commit_next") {
      const action = await dmAgent.runMutationTurn(arena);
      wsHub.broadcast({
        type: "announcement",
        arenaId,
        message: dmAgent.announce_change(arenaId, `${action.payload.mutationType} committed (${action.txHash})`)
      });
      res.json({ ok: true, result: action });
      return;
    }

    if (command === "announce") {
      const message = String(req.body?.message || "").trim();
      if (!message) {
        res.status(400).json({ ok: false, error: "message-required" });
        return;
      }
      wsHub.broadcast({ type: "announcement", arenaId, message });
      res.json({ ok: true, result: { message } });
      return;
    }

    res.status(400).json({ ok: false, error: "unsupported-command" });
  } catch (error) {
    console.error(`[agent-command] failed arena=${arenaId} command=${command}`, error);
    res.status(500).json({ ok: false, error: "agent-command-failed" });
  }
});

watchMutations(env.DUNGEON_COMMIT_ADDRESS as Hex, async (event) => {
  try {
    console.log(`[apply] mutation received arena=${event.arenaId} version=${event.versionId} tx=${event.txHash}`);
    const localArena = arenaStore.getOrCreate(event.arenaId);
    if (event.versionId > localArena.versionId + 1) {
      console.log(
        `[apply] backfill required arena=${event.arenaId} local=${localArena.versionId} target=${event.versionId}`
      );
      for (let v = localArena.versionId + 1; v < event.versionId; v += 1) {
        const historical = await dungeonCommitContract.read.getVersion([BigInt(event.arenaId), BigInt(v)]);
        const payload = decodeMutationData(
          mutationTypeFromIndex(Number(historical.mutationType)),
          historical.mutationData as Hex
        );
        mutationPayloadSchema.parse(payload);
        arenaStore.applyCommittedMutation(event.arenaId, v, payload);
        console.log(`[apply] backfilled arena=${event.arenaId} version=${v}`);
      }
    }

    const updated = arenaStore.applyCommittedMutation(event.arenaId, event.versionId, event.decodedPayload);
    console.log(`[apply] mutation applied arena=${event.arenaId} version=${updated.versionId}`);
    wsHub.broadcast({
      type: "mutation_applied",
      arenaId: event.arenaId,
      versionId: event.versionId,
      txHash: event.txHash,
      state: {
        ...updated,
        tiles: [...updated.tiles.entries()]
      }
    });
  } catch (error) {
    console.error(`[apply] mutation-apply-error arena=${event.arenaId} version=${event.versionId}`, error);
  }
});

const runAutoCommitTick = async () => {
  if (!env.AGENT_AUTOCOMMIT_ENABLED || autoCommitArenaIds.length === 0) return;

  for (const arenaId of autoCommitArenaIds) {
    if (autoCommitInFlight.has(arenaId)) continue;

    autoCommitInFlight.add(arenaId);
    try {
      const arena = arenaStore.getOrCreate(arenaId);
      console.log(`[agent-loop] committing arena=${arenaId} localVersion=${arena.versionId}`);
      const action = await dmAgent.runMutationTurn(arena);
      console.log(
        `[agent-loop] tx confirmed arena=${arenaId} mutation=${action.payload.mutationType} txHash=${action.txHash}`
      );

      wsHub.broadcast({
        type: "announcement",
        arenaId,
        message: dmAgent.announce_change(
          arenaId,
          `Agent committed ${action.payload.mutationType} (${action.txHash})`
        )
      });
    } catch (error) {
      console.error(`[agent-loop] commit failed arena=${arenaId}`, error);
    } finally {
      autoCommitInFlight.delete(arenaId);
    }
  }
};

const startAutoCommitLoop = () => {
  if (!env.AGENT_AUTOCOMMIT_ENABLED) {
    console.log("[agent-loop] disabled");
    return;
  }
  if (autoCommitArenaIds.length === 0) {
    console.log("[agent-loop] enabled but no valid arena ids configured");
    return;
  }

  console.log(
    `[agent-loop] enabled arenas=${autoCommitArenaIds.join(",")} intervalMs=${env.AGENT_AUTOCOMMIT_INTERVAL_MS} startupDelayMs=${env.AGENT_AUTOCOMMIT_STARTUP_DELAY_MS}`
  );

  setTimeout(() => {
    void runAutoCommitTick();
    setInterval(() => {
      void runAutoCommitTick();
    }, env.AGENT_AUTOCOMMIT_INTERVAL_MS);
  }, env.AGENT_AUTOCOMMIT_STARTUP_DELAY_MS);
};

httpServer.listen(env.PORT, () => {
  console.log(`arena-server listening on :${env.PORT}`);
  startAutoCommitLoop();
});
