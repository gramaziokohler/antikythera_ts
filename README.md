# antikythera_ts

The Antikythera domain model, its `compas_pb` plugin, and the browser agent runtime, for
TypeScript.

This is the TypeScript counterpart of the `antikythera` Python package: the same domain
model, mapped to the same protobuf schemas, over the same wire.

## What is in here

- **`src/models/tasks.ts`** — the domain model (`TaskAssignmentMessage`, `TaskCompletionMessage`, …),
  mirroring the `compas.data.Data` subclasses in `antikythera.models.tasks`.
- **`src/models/conversions.ts`** — the `compas_pb` plugin, mirroring
  `antikythera.models.conversions`. Registers each domain class against its protobuf message.
- **`src/agents/`** — the agent runtime: `Agent`, `AgentLauncher`, `Task`, `ExecutionContext`
  and an MQTT transport.
- **`src/proto/`** — generated bindings, fetched from an `antikythera` release. Nothing here
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
