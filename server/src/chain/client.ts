import { createPublicClient, createWalletClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import "../loadEnv.js";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(rpcUrl)
});

export function getWalletClient() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required for wallet client operations");
  }

  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(rpcUrl)
  });
}
