// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct Agent {
        address owner;
        string metadataURI;
        uint64 createdAt;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) public agents;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string metadataURI);
    event AgentUpdated(uint256 indexed agentId, string metadataURI);

    function registerAgent(string calldata metadataURI) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({owner: msg.sender, metadataURI: metadataURI, createdAt: uint64(block.timestamp)});

        emit AgentRegistered(agentId, msg.sender, metadataURI);
    }

    function updateAgent(uint256 agentId, string calldata metadataURI) external {
        Agent storage agent = agents[agentId];
        require(agent.owner != address(0), "agent-not-found");
        require(agent.owner == msg.sender, "not-owner");

        agent.metadataURI = metadataURI;
        emit AgentUpdated(agentId, metadataURI);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address owner = agents[agentId].owner;
        require(owner != address(0), "agent-not-found");
        return owner;
    }
}
