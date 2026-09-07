const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const contractAddress = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined)?.trim() || undefined;
export const chainName = (import.meta.env.VITE_CHAIN_NAME as string | undefined)?.trim() || "EVM testnet / local-ready";
export const explorerBaseUrl = (import.meta.env.VITE_EXPLORER_BASE_URL as string | undefined)?.trim() || "https://sepolia.etherscan.io/tx";

export function hasContractConfiguration(address?: string): address is string {
  return Boolean(address && ADDRESS_PATTERN.test(address));
}

export function getContractConfig() {
  return {
    address: contractAddress,
    chainName,
    explorerBaseUrl,
    configured: hasContractConfiguration(contractAddress),
  } as const;
}

export function buildExplorerUrl(transactionHash: string) {
  return `${explorerBaseUrl.replace(/\/$/, "")}/${transactionHash}`;
}

export type WorkspaceChainState = {
  address?: string;
  network: string;
  explorerBaseUrl: string;
  configured: boolean;
  contractLabel: string;
  anchorLabel: string;
};

export function resolveVerificationContractAddress(recordAddress?: string | null, configuredAddress = contractAddress) {
  return recordAddress ?? configuredAddress;
}

export function getAnchorConfiguration(address = contractAddress) {
  if (!hasContractConfiguration(address)) return null;
  return { address, network: chainName } as const;
}

export function getVerificationReadConfiguration(recordAddress?: string | null, configuredAddress = contractAddress) {
  const address = resolveVerificationContractAddress(recordAddress, configuredAddress);
  return hasContractConfiguration(address) ? { address } as const : null;
}

export function getWorkspaceChainState(address = contractAddress): WorkspaceChainState {
  const configured = hasContractConfiguration(address);
  return {
    address,
    network: chainName,
    explorerBaseUrl,
    configured,
    contractLabel: configured && address ? address : "Not configured",
    anchorLabel: configured ? "Connect when ready" : "Contract not configured",
  } as const;
}

export { ADDRESS_PATTERN };
