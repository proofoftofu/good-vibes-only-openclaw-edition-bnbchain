import cors from "cors";
import express from "express";
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/arena/:arenaId", (req, res) => {
  const arenaId = Number(req.params.arenaId);
  const arena = arenaStore.getOrCreate(arenaId);

  res.json({
    ...arena,
    tiles: [...arena.tiles.entries()]
  });
});

app.get("/arena/:arenaId/context", (req, res) => {
  const arenaId = Number(req.params.arenaId);
  const arena = arenaStore.getOrCreate(arenaId);
  res.json(dmAgent.get_arena_context(arena));
});

app.post("/arena/:arenaId/propose", (req, res) => {
  const arenaId = Number(req.params.arenaId);
  const arena = arenaStore.getOrCreate(arenaId);
  res.json(dmAgent.propose_mutation(dmAgent.get_arena_context(arena)));
});

app.post("/arena/:arenaId/commit", async (req, res) => {
  const arenaId = Number(req.params.arenaId);
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

httpServer.listen(env.PORT, () => {
  console.log(`arena-server listening on :${env.PORT}`);
});
