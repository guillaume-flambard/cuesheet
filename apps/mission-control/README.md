# Cuesheet Mission Control local slice

Six goal-level MCP tools, three MCP App views, existing Cuesheet runtime and journals. This is a local prototype, not daily-use selfhost acceptance.

From the repository root:

```sh
npm install --prefix apps/mission-control --workspaces=false
npm run build --prefix apps/mission-control --workspaces=false
npm test --prefix apps/mission-control --workspaces=false
node apps/mission-control/server.ts --config /absolute/owner-config.json
```

Owner configuration maps project IDs to canonical absolute paths:

```json
{"root":"/absolute/private/mission-state","projects":{"cuesheet":{"path":"/absolute/cuesheet","check":"/absolute/owner-check.mjs"}}}
```

The server uses stdio. Mutations are disabled unless the owner supplies `--allow-mutations`. Configure the existing Cuesheet provider/model route through its environment. Client tool arguments never select filesystem roots or check scripts. Read-only calls do not start missions. A mission retains its session and objective across corrections and restarts. Duplicate request IDs do not repeat the command.

For the captured real mission rendering proof:

```sh
node apps/mission-control/dev-host.mjs /absolute/proof/mission.json
```

Open http://127.0.0.1:4319. This loopback-only host displays a captured real MCP result through the SDK AppBridge and a sandboxed iframe. Refresh rereads the capture; it does not execute work. It is not a production host security implementation or a ChatGPT/Claude account connection.

The real bounded probe is `node apps/mission-control/real-demo.mjs /absolute/proof-directory`. It uses an actual provider and can incur existing provider usage. Read its pinned model and container configuration first. Its acceptance check only confirms the repository identity and declared test entry point. It does not prove product usability.

Open limitations: host-level approval/resume is not implemented; general human-boundary and Siri state do not exist in the runtime; the real probe observed no secondary agent and encountered tool failure/uncertainty. Those remain visible and unverified. Existing project TypeScript errors prevent a green strict repository check. See the canonical verification and state documents.
