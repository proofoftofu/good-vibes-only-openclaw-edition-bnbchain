import { createPublicClient, decodeAbiParameters, http, parseAbiParameters, type Address, type Hex } from "viem";

export interface ArenaStateResponse {
  arenaId: number;
  versionId: number;
  baseAltitude: number;
  hazardRate: number;
  enemySpeed: number;
  lootMultiplier: number;
  tiles: [string, string][];
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";
const RPC_URL = import.meta.env.VITE_BSC_TESTNET_RPC_URL || "https://bsc-testnet-rpc.publicnode.com";
const DUNGEON_COMMIT_ADDRESS = (
  import.meta.env.VITE_DUNGEON_COMMIT_ADDRESS ||
  import.meta.env.DUNGEON_COMMIT_ADDRESS ||
  ""
) as Address;

const client = createPublicClient({
  transport: http(RPC_URL)
});

const dungeonStateCommitAbi = [
  {
    type: "function",
    name: "latestVersion",
    stateMutability: "view",
    inputs: [{ name: "arenaId", type: "uint256" }],
    outputs: [
      {
        components: [
          { name: "versionId", type: "uint256" },
          { name: "versionHash", type: "bytes32" }
        ],
        name: "",
        type: "tuple"
      }
    ]
  },
  {
    type: "function",
    name: "latestAltitude",
    stateMutability: "view",
    inputs: [{ name: "arenaId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getVersion",
    stateMutability: "view",
    inputs: [
      { name: "arenaId", type: "uint256" },
      { name: "versionId", type: "uint256" }
    ],
    outputs: [
      {
        components: [
          { name: "versionId", type: "uint256" },
          { name: "mutationType", type: "uint8" },
          { name: "mutationData", type: "bytes" },
          { name: "versionHash", type: "bytes32" },
          { name: "committer", type: "address" },
          { name: "createdAt", type: "uint64" }
        ],
        name: "",
        type: "tuple"
      }
    ]
  }
] as const;

type CachedArena = {
  state: ArenaStateResponse;
  tileMap: Map<string, string>;
};

const arenaCache = new Map<number, CachedArena>();

function getOrCreateCache(arenaId: number): CachedArena {
  const existing = arenaCache.get(arenaId);
  if (existing) return existing;

  const initial: CachedArena = {
    state: {
      arenaId,
      versionId: 0,
      baseAltitude: 0,
      hazardRate: 30,
      enemySpeed: 1,
      lootMultiplier: 1,
      tiles: [],
      updatedAt: new Date().toISOString()
    },
    tileMap: new Map<string, string>()
  };
  arenaCache.set(arenaId, initial);
  return initial;
}

function readLatestVersionId(raw: unknown): number {
  if (Array.isArray(raw) && raw.length > 0) {
    return Number(raw[0]);
  }
  if (raw && typeof raw === "object" && "versionId" in raw) {
    return Number((raw as { versionId: bigint | number }).versionId);
  }
  return 0;
}

function applyMutation(state: ArenaStateResponse, tileMap: Map<string, string>, mutationType: number, mutationData: Hex) {
  if (mutationType === 0) {
    const [hazardRate] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    state.hazardRate = Number(hazardRate);
    return;
  }

  if (mutationType === 1) {
    const [enemySpeedBps] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    state.enemySpeed = Number(enemySpeedBps) / 100;
    return;
  }

  if (mutationType === 2) {
    const [lootMultiplierBps] = decodeAbiParameters(parseAbiParameters("uint16"), mutationData);
    state.lootMultiplier = Number(lootMultiplierBps) / 100;
    return;
  }

  if (mutationType === 3) {
    const [x, y, tileStateRaw] = decodeAbiParameters(parseAbiParameters("uint8, uint8, uint8"), mutationData);
    const tileState = Number(tileStateRaw) === 0 ? "OPEN" : Number(tileStateRaw) === 1 ? "BLOCKED" : "HAZARD";
    tileMap.set(`${Number(x)}:${Number(y)}`, tileState);
    state.tiles = [...tileMap.entries()];
    return;
  }

  if (mutationType === 4) {
    const [altitude] = decodeAbiParameters(parseAbiParameters("uint32"), mutationData);
    state.baseAltitude = Number(altitude);
  }
}

export async function fetchArena(arenaId: number): Promise<ArenaStateResponse> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(DUNGEON_COMMIT_ADDRESS)) {
    throw new Error("invalid or missing VITE_DUNGEON_COMMIT_ADDRESS");
  }

  const cached = getOrCreateCache(arenaId);
  const latestRaw = await client.readContract({
    address: DUNGEON_COMMIT_ADDRESS,
    abi: dungeonStateCommitAbi,
    functionName: "latestVersion",
    args: [BigInt(arenaId)]
  });

  const latestVersionId = readLatestVersionId(latestRaw);
  if (latestVersionId < cached.state.versionId) {
    return { ...cached.state };
  }

  if (latestVersionId > cached.state.versionId) {
    for (let version = cached.state.versionId + 1; version <= latestVersionId; version += 1) {
      const item = await client.readContract({
        address: DUNGEON_COMMIT_ADDRESS,
        abi: dungeonStateCommitAbi,
        functionName: "getVersion",
        args: [BigInt(arenaId), BigInt(version)]
      });

      const mutationType = Number(item.mutationType);
      const mutationData = item.mutationData as Hex;
      applyMutation(cached.state, cached.tileMap, mutationType, mutationData);
      cached.state.versionId = version;
      cached.state.updatedAt = new Date(Number(item.createdAt) * 1000).toISOString();
    }
  }

  const latestAltitude = await client.readContract({
    address: DUNGEON_COMMIT_ADDRESS,
    abi: dungeonStateCommitAbi,
    functionName: "latestAltitude",
    args: [BigInt(arenaId)]
  });
  cached.state.baseAltitude = Number(latestAltitude);

  return { ...cached.state, tiles: [...cached.tileMap.entries()] };
}

export async function commitMutation(arenaId: number, altitude?: number) {
  const res = await fetch(`${API_BASE}/arena/${arenaId}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      Number.isFinite(altitude) ? { altitude: Math.max(0, Math.floor(altitude as number)) } : {}
    )
  });
  if (!res.ok) {
    throw new Error(`failed to commit mutation: ${res.status}`);
  }
  return res.json();
}
