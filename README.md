# antikythera_ts

The Antikythera domain model, its `compas_pb` plugin, and the browser agent runtime, for
TypeScript.

This is the TypeScript counterpart of the `antikythera` Python package: the same domain
model, mapped to the same protobuf schemas, over the same wire.

## What is in here

- **`src/models/tasks.ts`**: the domain model (`TaskAssignmentMessage`, `TaskCompletionMessage`, …),
  mirroring the `compas.data.Data` subclasses in `antikythera.models.tasks`.
- **`src/models/conversions.ts`**: the `compas_pb` plugin, mirroring
  `antikythera.models.conversions`. Registers each domain class against its protobuf message.
- **`src/agents/`**: the agent runtime, holding `Agent`, `AgentLauncher`, `Task`,
  `ExecutionContext` and an MQTT transport.
- **`src/proto/`**: generated bindings, fetched from an `antikythera` release. Nothing here
  is generated locally.

## Registering the plugin

Python discovers `compas_pb` plugins through packaging entry points. JavaScript has no
equivalent, and a bundled browser application cannot inspect its dependency tree at
runtime, so registration is explicit:

```ts
import { registerAntikytheraTypes } from "@gramaziokohler/antikythera-ts";

registerAntikytheraTypes();
```

`AgentLauncher` calls it for you. Call it yourself before encoding or decoding Antikythera
messages without the launcher.

After that, the unified entry points carry domain objects:

```ts
import { pbDump, pbLoadBytes } from "@gramaziokohler/compas-pb-ts";

const bytes = pbDump(new TaskClaimRequest({ taskId, agentId }));
const message = pbLoadBytes(bytes); // a TaskClaimRequest
```

## Updating the generated bindings

```bash
npm run proto                              # the pinned antikythera release
npm run proto -- --from-local ../antikythera   # a local checkout
```

The pin lives in `proto/upstream.json`. Imports of `compas_pb`'s schemas are rewritten to
`@gramaziokohler/compas-pb-ts` on fetch: protobuf-es links file descriptors by identity, so
a vendored second copy of `compas_pb.data` would register a competing descriptor.

## Architecture

See the [architecture page](https://compas.dev/compas_pb/architecture/) in the compas_pb
documentation for how domain-model owners, language runtimes and schema artifacts fit
together.

## Working on this package alongside the frontend

The frontend consumes this package from npm. To have local changes show up there without
publishing, link the checkout and run a watch build.

```sh
# once, in this repo
npm link
npm run dev            # rebuilds dist/ on every change

# once, in antikythera-frontend
npm link @gramaziokohler/antikythera-ts
npm run dev            # http://localhost:5174
```

The frontend's Vite config excludes both SDKs from dependency pre-bundling, so a rebuild
here shows up on reload rather than being served from Vite's cache.

Two things to know:

- `npm install` in the frontend replaces the link with the published version. Re-run
  `npm link @gramaziokohler/antikythera-ts` afterwards.
- Do not commit a `file:` dependency in the frontend. The link lives in `node_modules`
  and leaves `package.json` alone, which is the point.

### With the backend in Docker

The frontend image is a production build served by nginx, and its build context does not
include this package, so Docker is not the place for this loop. Run the services it needs
and keep the frontend on the Vite dev server:

```sh
# in antikythera
docker compose up -d mqtt-broker orchestrator redis
```

The dev server proxies `/api` to `localhost:8000`, and the browser reaches the broker at
`ws://localhost:8083/mqtt`, both of which the compose file exposes. When you want to check
the real image instead, `docker compose up --build frontend` builds it from the published
package, exactly as CI would.
