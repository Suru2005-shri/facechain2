import { describe, expect, it } from "vitest";
import { JsonRpcProvider, Wallet, isAddress } from "ethers";

describe("Sepolia blockchain runtime configuration", () => {
  it("connects to Sepolia and derives a deployer wallet without exposing the key", async () => {
    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.VITE_CONTRACT_ADDRESS;

    expect(rpcUrl).toMatch(/^https:\/\//);
    expect(privateKey).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(contractAddress).toBe("0x87464242377d9900c71cDe9e6F37299A8296C3F0");
    expect(isAddress(contractAddress!)).toBe(true);

    const provider = new JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const wallet = new Wallet(privateKey!, provider);

    expect(network.chainId).toBe(11155111n);
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(process.env.VITE_PRIVATE_KEY).toBeUndefined();
    expect(contractAddress).not.toContain(privateKey!);
  }, 15_000);
});
