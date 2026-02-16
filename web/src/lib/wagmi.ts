import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const rpcUrl = import.meta.env.VITE_BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";

export const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  transports: {
    [bscTestnet.id]: http(rpcUrl)
  },
  connectors: [injected()]
});
