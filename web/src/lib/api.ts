export interface ArenaStateResponse {
  arenaId: number;
  versionId: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export async function fetchArena(arenaId: number): Promise<ArenaStateResponse> {
  const res = await fetch(`${API_BASE}/arena/${arenaId}`);
  if (!res.ok) {
    throw new Error(`failed to fetch arena: ${res.status}`);
  }
  return res.json();
}

export async function commitMutation(arenaId: number) {
  const res = await fetch(`${API_BASE}/arena/${arenaId}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`failed to commit mutation: ${res.status}`);
  }
  return res.json();
}

export function openArenaSocket(onMessage: (value: unknown) => void) {
  const url = (import.meta.env.VITE_WS_URL || "ws://localhost:8787/ws").replace(/^http/, "ws");
  const ws = new WebSocket(url);
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  });
  return ws;
}
