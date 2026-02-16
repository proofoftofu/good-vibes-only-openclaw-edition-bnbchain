import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with ${deployer.address}`);

  const agentRegistryFactory = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await agentRegistryFactory.deploy();
  await agentRegistry.waitForDeployment();

  const arenaRegistryFactory = await ethers.getContractFactory("ArenaRegistry");
  const arenaRegistry = await arenaRegistryFactory.deploy(await agentRegistry.getAddress());
  await arenaRegistry.waitForDeployment();

  const dungeonStateCommitFactory = await ethers.getContractFactory("DungeonStateCommit");
  const dungeonStateCommit = await dungeonStateCommitFactory.deploy(
    await arenaRegistry.getAddress(),
    await agentRegistry.getAddress()
  );
  await dungeonStateCommit.waitForDeployment();

  const deployment = {
    chain: "bscTestnet",
    deployedAt: new Date().toISOString(),
    contracts: {
      AgentRegistry: await agentRegistry.getAddress(),
      ArenaRegistry: await arenaRegistry.getAddress(),
      DungeonStateCommit: await dungeonStateCommit.getAddress()
    }
  };

  const outDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "bscTestnet.json"), JSON.stringify(deployment, null, 2));

  console.log("Deployment complete:");
  console.log(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
