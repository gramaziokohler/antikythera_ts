import { defineConfig } from "tsdown";

export default defineConfig([
  {
    // Unbundled for the same reason compas_pb_ts is: the generated protobuf modules must
    // stay single instances so their file descriptors keep their identity.
    entry: ["./src/index.ts", "./src/agents/index.ts", "./src/proto/**/*.ts"],
    dts: true,
    minify: false,
    sourcemap: true,
    unbundle: true,
  },
]);
