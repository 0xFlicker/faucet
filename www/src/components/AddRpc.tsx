import { FC, useCallback } from "react";
import { BigNumber } from "ethers";
import { Button } from "@mui/material";

export const AddRpc: FC = () => {
  const switchChain = useCallback(async () => {
    const chainId = BigNumber.from(
      process.env.NEXT_PUBLIC_CHAIN_ID ?? ""
    ).toHexString();
    const addChainOpts = {
      chainId,
      chainName: process.env.NEXT_PUBLIC_CHAIN,
      rpcUrls: [process.env.NEXT_PUBLIC_RPC],
      blockExplorerUrls: [process.env.NEXT_PUBLIC_BLOCK_EXPLORER],
    };
    await window.ethereum?.request({
      method: "wallet_addEthereumChain",
      params: [addChainOpts],
    });
  }, []);
  return (
    <Button variant="text" onClick={switchChain}>
      Add RPC
    </Button>
  );
};
