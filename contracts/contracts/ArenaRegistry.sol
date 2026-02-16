// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgentRegistry.sol";

contract ArenaRegistry {
    struct Arena {
        address owner;
        uint256 agentId;
        bytes32 arenaKey;
        uint64 createdAt;
    }

    AgentRegistry public immutable agentRegistry;
    uint256 public nextArenaId = 1;
    mapping(uint256 => Arena) public arenas;

    event ArenaCreated(uint256 indexed arenaId, address indexed owner, uint256 indexed agentId, bytes32 arenaKey);
    event ArenaAgentSet(uint256 indexed arenaId, uint256 indexed oldAgentId, uint256 indexed newAgentId);

    constructor(address agentRegistryAddress) {
        require(agentRegistryAddress != address(0), "invalid-agent-registry");
        agentRegistry = AgentRegistry(agentRegistryAddress);
    }

    function createArena(uint256 agentId, bytes32 arenaKey) external returns (uint256 arenaId) {
        require(agentRegistry.ownerOf(agentId) == msg.sender, "agent-owner-required");

        arenaId = nextArenaId++;
        arenas[arenaId] = Arena({
            owner: msg.sender,
            agentId: agentId,
            arenaKey: arenaKey,
            createdAt: uint64(block.timestamp)
        });

        emit ArenaCreated(arenaId, msg.sender, agentId, arenaKey);
    }

    function setArenaAgent(uint256 arenaId, uint256 agentId) external {
        Arena storage arena = arenas[arenaId];
        require(arena.owner != address(0), "arena-not-found");
        require(arena.owner == msg.sender, "arena-owner-required");
        require(agentRegistry.ownerOf(agentId) == msg.sender, "agent-owner-required");

        uint256 oldAgentId = arena.agentId;
        arena.agentId = agentId;

        emit ArenaAgentSet(arenaId, oldAgentId, agentId);
    }

    function getArena(uint256 arenaId) external view returns (Arena memory) {
        Arena memory arena = arenas[arenaId];
        require(arena.owner != address(0), "arena-not-found");
        return arena;
    }
}
