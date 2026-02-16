// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ArenaRegistry.sol";
import "./AgentRegistry.sol";

contract DungeonStateCommit {
    enum MutationType {
        SET_HAZARD_RATE,
        SET_ENEMY_SPEED,
        SET_LOOT_MULTIPLIER,
        PATCH_TILES
    }

    struct Version {
        uint256 versionId;
        uint8 mutationType;
        bytes mutationData;
        bytes32 versionHash;
        address committer;
        uint64 createdAt;
    }

    struct ArenaLatest {
        uint256 versionId;
        bytes32 versionHash;
    }

    ArenaRegistry public immutable arenaRegistry;
    AgentRegistry public immutable agentRegistry;

    mapping(uint256 => ArenaLatest) public latestVersion;
    mapping(uint256 => mapping(uint256 => Version)) public versions;

    event MutationCommitted(
        uint256 indexed arenaId,
        uint256 indexed versionId,
        uint8 indexed mutationType,
        bytes32 versionHash,
        address committer
    );

    constructor(address arenaRegistryAddress, address agentRegistryAddress) {
        require(arenaRegistryAddress != address(0), "invalid-arena-registry");
        require(agentRegistryAddress != address(0), "invalid-agent-registry");

        arenaRegistry = ArenaRegistry(arenaRegistryAddress);
        agentRegistry = AgentRegistry(agentRegistryAddress);
    }

    function commitMutation(
        uint256 arenaId,
        uint8 mutationType,
        bytes calldata mutationData,
        bytes32 versionHash
    ) external returns (uint256 versionId) {
        require(uint256(mutationType) <= uint256(MutationType.PATCH_TILES), "invalid-mutation-type");
        require(versionHash != bytes32(0), "invalid-version-hash");

        ArenaRegistry.Arena memory arena = arenaRegistry.getArena(arenaId);
        address agentOwner = agentRegistry.ownerOf(arena.agentId);
        require(agentOwner == msg.sender, "agent-owner-required");

        versionId = latestVersion[arenaId].versionId + 1;
        latestVersion[arenaId] = ArenaLatest({versionId: versionId, versionHash: versionHash});

        versions[arenaId][versionId] = Version({
            versionId: versionId,
            mutationType: mutationType,
            mutationData: mutationData,
            versionHash: versionHash,
            committer: msg.sender,
            createdAt: uint64(block.timestamp)
        });

        emit MutationCommitted(arenaId, versionId, mutationType, versionHash, msg.sender);
    }

    function getVersion(uint256 arenaId, uint256 versionId) external view returns (Version memory) {
        Version memory version = versions[arenaId][versionId];
        require(version.versionId != 0, "version-not-found");
        return version;
    }
}
