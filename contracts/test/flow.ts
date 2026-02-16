import { expect } from "chai";
import { ethers } from "hardhat";

describe("Onchain DM flow", () => {
  it("allows agent owner to commit mutation for arena", async () => {
    const [owner] = await ethers.getSigners();

    const agentRegistry = await (await ethers.getContractFactory("AgentRegistry")).deploy();
    await agentRegistry.waitForDeployment();

    const arenaRegistry = await (await ethers.getContractFactory("ArenaRegistry")).deploy(
      await agentRegistry.getAddress()
    );
    await arenaRegistry.waitForDeployment();

    const commit = await (await ethers.getContractFactory("DungeonStateCommit")).deploy(
      await arenaRegistry.getAddress(),
      await agentRegistry.getAddress()
    );
    await commit.waitForDeployment();

    const registerTx = await agentRegistry.registerAgent("ipfs://dm-agent/1");
    const registerReceipt = await registerTx.wait();
    const registeredEvent = registerReceipt?.logs[0];
    expect(registeredEvent).to.not.be.undefined;

    await arenaRegistry.createArena(1, ethers.encodeBytes32String("alpha"));

    const mutationData = ethers.AbiCoder.defaultAbiCoder().encode(["uint16"], [80]);
    const versionHash = ethers.keccak256(mutationData);

    await expect(commit.commitMutation(1, 0, mutationData, versionHash)).to.emit(commit, "MutationCommitted");

    const latest = await commit.latestVersion(1);
    expect(latest.versionId).to.equal(1);

    const version = await commit.getVersion(1, 1);
    expect(version.committer).to.equal(owner.address);
  });
});
