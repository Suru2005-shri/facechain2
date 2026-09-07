import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import solc from "solc";

describe("ProofRegistry contract", () => {
  it("compiles and exposes the intended privacy-minimized interface", () => {
    const source = readFileSync(resolve(process.cwd(), "contracts/ProofRegistry.sol"), "utf8");
    const input = {
      language: "Solidity",
      sources: { "ProofRegistry.sol": { content: source } },
      settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
      errors?: Array<{ severity: string; formattedMessage: string }>;
      contracts: Record<string, Record<string, { abi: Array<{ type: string; name?: string }>; evm: { bytecode: { object: string } } }>>;
    };
    const errors = output.errors?.filter(error => error.severity === "error") ?? [];
    expect(errors).toEqual([]);
    const compiled = output.contracts["ProofRegistry.sol"].ProofRegistry;
    expect(compiled.evm.bytecode.object.length).toBeGreaterThan(100);
    const functionNames = compiled.abi.filter(item => item.type === "function").map(item => item.name);
    expect(functionNames).toEqual(expect.arrayContaining(["registerProof", "verifyProof", "proofs"]));
    const eventNames = compiled.abi.filter(item => item.type === "event").map(item => item.name);
    expect(eventNames).toContain("ProofRegistered");
  });

  it("contains no raw biometric or source-content storage fields", () => {
    const source = readFileSync(resolve(process.cwd(), "contracts/ProofRegistry.sol"), "utf8");
    const structBody = source.split("struct Proof {")[1]?.split("}")[0] ?? "";
    expect(structBody).not.toMatch(/string|bytes memory|image|embedding|face|content|name/i);
    expect(structBody).toContain("bytes32 evidenceDigest");
    expect(structBody).toContain("bytes32 sourceUrlDigest");
  });
});
