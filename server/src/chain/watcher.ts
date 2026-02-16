import { getContract, parseAbiItem, type Hex } from "viem";
import { publicClient } from "./client.js";
import { dungeonStateCommitAbi } from "./abi.js";
import { decodeMutationData, mutationTypeFromIndex } from "./decode.js";
import { mutationPayloadSchema, type MutationPayload } from "../types/mutation.js";

export interface MutationEvent {
  arenaId: number;
  versionId: number;
  mutationType: number;
  mutationData: Hex;
  decodedPayload: MutationPayload;
  txHash: Hex;
}

export function watchMutations(contractAddress: Hex, onMutation: (event: MutationEvent) => Promise<void>) {
  console.log(`[watcher] starting for contract ${contractAddress}`);

  const mutationCommittedEvent = parseAbiItem(
    "event MutationCommitted(uint256 indexed arenaId, uint256 indexed versionId, uint8 indexed mutationType, bytes32 versionHash, address committer)"
  );

  const contract = getContract({
    address: contractAddress,
    abi: dungeonStateCommitAbi,
    client: publicClient
  });

  let lastProcessedBlock: bigint | null = null;
  let queue = Promise.resolve();

  return publicClient.watchBlockNumber({
    poll: true,
    emitOnBegin: true,
    onBlockNumber: (blockNumber) => {
      queue = queue
        .then(async () => {
          const fromBlock = lastProcessedBlock === null ? blockNumber : lastProcessedBlock + 1n;
          if (fromBlock > blockNumber) {
            return;
          }

          const logs = await publicClient.getLogs({
            address: contractAddress,
            event: mutationCommittedEvent,
            fromBlock,
            toBlock: blockNumber
          });
          if (logs.length > 0) {
            console.log(
              `[watcher] found ${logs.length} MutationCommitted log(s) in blocks ${fromBlock.toString()}-${blockNumber.toString()}`
            );
          }

          for (const log of logs) {
            const arenaId = Number(log.args.arenaId ?? 0n);
            const versionId = Number(log.args.versionId ?? 0n);
            const mutationType = Number(log.args.mutationType ?? 0);
            console.log(
              `[watcher] processing tx=${log.transactionHash} arena=${arenaId} version=${versionId} mutationType=${mutationType}`
            );

            const version = await contract.read.getVersion([BigInt(arenaId), BigInt(versionId)]);
            const decoded = decodeMutationData(mutationTypeFromIndex(mutationType), version.mutationData as Hex);
            mutationPayloadSchema.parse(decoded);

            await onMutation({
              arenaId,
              versionId,
              mutationType,
              mutationData: version.mutationData as Hex,
              decodedPayload: decoded,
              txHash: log.transactionHash as Hex
            });
            console.log(`[watcher] applied callback for tx=${log.transactionHash}`);
          }

          lastProcessedBlock = blockNumber;
        })
        .catch((error) => {
          console.error("watcher-error", error);
        });
    },
    onError: (error) => {
      console.error("watcher-error", error);
    }
  });
}
