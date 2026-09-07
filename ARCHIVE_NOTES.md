# FaceChain Verify archive

This archive contains the tested FaceChain Verify source workspace and a local copy of the supplied video asset under `static-assets/`.

Secret-bearing project metadata is intentionally excluded. Configure `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `VITE_CONTRACT_ADDRESS`, `SERPAPI_API_KEY`, database/auth values, and other managed environment variables through the deployment environment. Never commit a private key or `.env` file.

The application references the managed web-storage URL for the background video so the published project can serve it through the managed asset pipeline. The local copy is included for reference and offline asset handoff.
