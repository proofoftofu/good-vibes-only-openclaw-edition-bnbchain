import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Bootstrapping with ${signer.address}`);

  const deploymentPath = path.resolve(__dirname, "../deployments/bscTestnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/bscTestnet.json. Run deploy first.");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8")) as {
    contracts: {
      AgentRegistry: string;
      ArenaRegistry: string;
    };
  };

  const agentRegistry = await ethers.getContractAt("AgentRegistry", deployment.contracts.AgentRegistry);
  const arenaRegistry = await ethers.getContractAt("ArenaRegistry", deployment.contracts.ArenaRegistry);

  const metadataURI = process.env.DM_AGENT_METADATA_URI || "ipfs://relic-run/dm-agent/default";
  const arenaKey = ethers.keccak256(ethers.toUtf8Bytes(process.env.ARENA_KEY_SEED || "alpha"));

  const registerTx = await agentRegistry.registerAgent(metadataURI);
  const registerReceipt = await registerTx.wait();
  const registerLog = registerReceipt?.logs[0];
  if (!registerLog) {
    throw new Error("Failed to parse AgentRegistered event");
  }

  const parsedRegister = agentRegistry.interface.parseLog({
    topics: registerLog.topics as string[],
    data: registerLog.data
  });

  const agentId = Number(parsedRegister?.args[0] ?? 0n);
  if (!agentId) {
    throw new Error("Could not resolve agentId from AgentRegistered event");
  }

  const createTx = await arenaRegistry.createArena(agentId, arenaKey);
  const createReceipt = await createTx.wait();
  const createLog = createReceipt?.logs[0];
  if (!createLog) {
    throw new Error("Failed to parse ArenaCreated event");
  }

  const parsedCreate = arenaRegistry.interface.parseLog({
    topics: createLog.topics as string[],
    data: createLog.data
  });

  const arenaId = Number(parsedCreate?.args[0] ?? 0n);

  const bootstrap = {
    bootstrappedAt: new Date().toISOString(),
    signer: signer.address,
    agentId,
    arenaId,
    metadataURI,
    arenaKey
  };

  fs.writeFileSync(path.resolve(__dirname, "../deployments/bootstrap.bscTestnet.json"), JSON.stringify(bootstrap, null, 2));

  console.log("Bootstrap complete:");
  console.log(bootstrap);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
