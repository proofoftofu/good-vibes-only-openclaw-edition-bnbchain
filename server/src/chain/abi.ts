export const dungeonStateCommitAbi = [
  {
    type: "function",
    name: "commitMutation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "arenaId", type: "uint256" },
      { name: "mutationType", type: "uint8" },
      { name: "mutationData", type: "bytes" },
      { name: "versionHash", type: "bytes32" }
    ],
    outputs: [{ name: "versionId", type: "uint256" }]
  },
  {
    type: "event",
    name: "MutationCommitted",
    inputs: [
      { indexed: true, internalType: "uint256", name: "arenaId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "versionId", type: "uint256" },
      { indexed: true, internalType: "uint8", name: "mutationType", type: "uint8" },
      { indexed: false, internalType: "bytes32", name: "versionHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "committer", type: "address" }
    ],
    anonymous: false
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
