import { describe, expect, it } from "vitest";
import { buildExplorerUrl, contractAddress, getContractConfig, getWorkspaceChainState, hasContractConfiguration } from "./contract-config";

describe("frontend contract configuration", () => {
  it("exposes the configured address to anchoring and verification surfaces", () => {
    const config = getContractConfig();
    expect(contractAddress).toBe("0x87464242377d9900c71cDe9e6F37299A8296C3F0");
    expect(config.address).toBe(contractAddress);
    expect(config.configured).toBe(true);
    expect(hasContractConfiguration(config.address)).toBe(true);
    expect(getWorkspaceChainState(config.address).anchorLabel).toBe("Connect when ready");
    expect(buildExplorerUrl("0xabc")).toContain("/0xabc");
  });

  it("rejects malformed contract addresses", () => {
    expect(hasContractConfiguration("0x123")).toBe(false);
    expect(hasContractConfiguration(undefined)).toBe(false);
    expect(getWorkspaceChainState("").configured).toBe(false);
    expect(getWorkspaceChainState("").anchorLabel).toBe("Contract not configured");
  });
});
