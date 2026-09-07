# ProofRegistry deployment workflow

The contract is intentionally small and stores only privacy-minimized commitments. Use a disposable wallet with minimal testnet funds and deploy through a trusted, standard toolchain such as Remix, Hardhat, or Foundry.

## Release sequence

1. Compile `ProofRegistry.sol` with Solidity `0.8.24` or a compatible compiler in the `0.8.x` range.
2. Run the repository contract test and the application integrity tests.
3. Deploy to the team’s chosen EVM testnet.
4. Verify the published source with the network’s explorer where supported.
5. Configure the public `VITE_CONTRACT_ADDRESS` and `VITE_CHAIN_NAME` values through the project environment manager.
6. Restart the application and confirm the Security posture center reports the contract address.
7. Create one consented evidence record, connect a browser wallet, and call `registerProof`.
8. Save the contract address, network, transaction hash, evidence identifier, and commit hash in the release notes.
9. Attempt the same evidence identifier a second time and confirm the application communicates a duplicate state rather than silently retrying.
10. Run independent verification and show `VALID`, then change one evidence field and show `ALTERED`.

## Data review before signing

Inspect the transaction inputs before approval. The expected arguments are three `bytes32` values: `evidenceId`, `evidenceDigest`, and `sourceUrlDigest`. There should be no raw image bytes, face descriptor, source URL, title, name, or post content in the transaction calldata.

## Production caution

A public testnet deployment is not a production security audit. Before real-world use, review access controls, abuse cases, chain costs, privacy impact, key custody, network reliability, source authenticity, and data-deletion obligations with qualified specialists.
