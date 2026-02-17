import { useEffect, useState } from "react";
import { fetchArena, commitMutation, openArenaSocket, type ArenaStateResponse } from "./lib/api";
import { GameCanvas } from "./components/GameCanvas";
import { ControlPanel } from "./components/ControlPanel";

const arenaId = Number(import.meta.env.VITE_ARENA_ID || 1);
const agentModeEnabled = import.meta.env.VITE_AGENT_MODE === "1" || import.meta.env.VITE_AGENT_MODE === "true";
const agentRepoUrl =
  import.meta.env.VITE_AGENT_REPO_URL ||
  "https://github.com/proofoftofu/good-vibes-only-openclaw-edition-bnbchain";

const initialArena: ArenaStateResponse = {
  arenaId,
  versionId: 0,
  baseAltitude: 0,
  hazardRate: 30,
  enemySpeed: 1,
  lootMultiplier: 1,
  tiles: [],
  updatedAt: new Date().toISOString()
};

export default function App() {
  const [arena, setArena] = useState<ArenaStateResponse>(initialArena);
  const [status, setStatus] = useState("Ready");
  const [latestTxHash, setLatestTxHash] = useState<string>();
  const [runNonce, setRunNonce] = useState(1);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    fetchArena(arenaId)
      .then(setArena)
      .catch(() => setStatus("Failed to load arena state"));

    const ws = openArenaSocket((payload: unknown) => {
      const event = payload as {
        type?: string;
        txHash?: string;
        state?: ArenaStateResponse;
      };

      if (event.type === "mutation_applied" && event.state) {
        setArena(event.state);
        setLatestTxHash(event.txHash);
        setStatus(`On-chain mutation applied at version ${event.state.versionId}`);
      }

      if (event.type === "announcement") {
        setStatus("Dungeon master announced a phase shift");
      }
    });

    return () => ws.close();
  }, []);

  const onCommit = async () => {
    const previousVersion = arena.versionId;
    setStatus("Submitting mutation transaction...");
    try {
      const result = await commitMutation(arenaId);
      setLatestTxHash(result.txHash);
      const committedType = result?.payload?.mutationType ? String(result.payload.mutationType) : "mutation";
      setStatus(`Transaction confirmed (${committedType}). Waiting for watcher apply...`);
      const updated = await waitForArenaVersion(arenaId, previousVersion);
      if (updated) {
        setArena(updated);
        setStatus(`On-chain mutation applied at version ${updated.versionId}`);
      } else {
        setStatus("Tx confirmed, but apply event delayed. Check server logs.");
      }
    } catch {
      setStatus("Mutation commit failed. Check server and wallet key configuration.");
    }
  };

  if (!hasStarted) {
    return (
      <main>
        <section className="landing">
          <p className="landing-kicker">Up-Only Onchain Chaos</p>
          <h1>Relic Run: Dungeon Under Rewrite</h1>
          <p>
            This is an Up Only style game. The dungeon is managed by an AI agent that reads game state, commits
            onchain updates, and mutates physics and chaos in real time.
          </p>
          <ul>
            <li>Climb forever with physics-based jumps and collisions.</li>
            <li>AI game master continuously changes hazard rate, speed, and tile mutations.</li>
            <li>Every commit is visible and applied through the watcher pipeline.</li>
          </ul>
          <div className="landing-actions">
            <button
              onClick={() => {
                setHasStarted(true);
                setRunNonce((v) => v + 1);
                setStatus("Run started. Climb as high as possible.");
              }}
            >
              Start Game
            </button>
            <a href={agentRepoUrl} target="_blank" rel="noreferrer">
              Run your own agent (GitHub)
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Relic Run: Dungeon Under Rewrite</h1>
          <p>Onchain DM commits mutate a 3D survival arena in real time.</p>
        </div>
      </header>

      <section className="layout">
        <GameCanvas
          versionId={arena.versionId}
          baseAltitude={arena.baseAltitude}
          hazardRate={arena.hazardRate}
          enemySpeed={arena.enemySpeed}
          lootMultiplier={arena.lootMultiplier}
          tiles={arena.tiles}
          runNonce={runNonce}
        />
        <ControlPanel
          arenaId={arena.arenaId}
          versionId={arena.versionId}
          hazardRate={arena.hazardRate}
          enemySpeed={arena.enemySpeed}
          lootMultiplier={arena.lootMultiplier}
          patchTiles={arena.tiles.length}
          status={status}
          latestTxHash={latestTxHash}
          onCommit={onCommit}
          agentModeEnabled={agentModeEnabled}
          agentRepoUrl={agentRepoUrl}
        />
      </section>
    </main>
  );
}

async function waitForArenaVersion(arenaIdValue: number, previousVersion: number): Promise<ArenaStateResponse | null> {
  const attempts = 12;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(1500);
    try {
      const next = await fetchArena(arenaIdValue);
      if (next.versionId > previousVersion) {
        return next;
      }
    } catch {
      // Ignore transient fetch issues while polling for update.
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
