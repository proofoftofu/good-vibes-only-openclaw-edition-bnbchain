import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { fetchArena, commitMutation, openArenaSocket, type ArenaStateResponse } from "./lib/api";
import { GameCanvas } from "./components/GameCanvas";
import { ControlPanel } from "./components/ControlPanel";

const arenaId = Number(import.meta.env.VITE_ARENA_ID || 1);

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
  const [currentAltitude, setCurrentAltitude] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [latestTxHash, setLatestTxHash] = useState<string>();
  const [runNonce, setRunNonce] = useState(0);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const shortAddress = useMemo(() => {
    if (!address) {
      return "";
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

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

  useEffect(() => {
    setRunNonce(1);
    setStatus("Run auto-started. Keep climbing.");
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

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Relic Run: Dungeon Under Rewrite</h1>
          <p>Onchain DM commits mutate a 3D survival arena in real time.</p>
        </div>
        <div className="wallet-box">
          {isConnected ? (
            <>
              <span>{shortAddress}</span>
              <button onClick={() => disconnect()}>Disconnect</button>
            </>
          ) : (
            <button onClick={() => connectors[0] && connect({ connector: connectors[0] })}>Connect Wallet</button>
          )}
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
          onAltitudeChange={setCurrentAltitude}
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
          onStartRun={() => {
            setRunNonce((v) => v + 1);
            setStatus("Run recentered. Keep climbing.");
          }}
          onCommit={onCommit}
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
