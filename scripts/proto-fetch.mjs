// Fetches the generated TypeScript bindings published by antikythera.
//
// antikythera owns antikythera.proto and publishes bindings for every supported language
// on each release; this package consumes the TypeScript one. It generates nothing itself.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, "proto", "upstream.json"), "utf8"),
);
const outputRoot = path.join(projectRoot, "src", "proto");
const assetName = `antikythera-generated-typescript-${manifest.generatorVersion}.zip`;

const args = parseArguments(process.argv.slice(2));
const staging = mkdtempSync(path.join(tmpdir(), "antikythera-bindings-"));

try {
  const archive = args.fromLocal
    ? localArchive(args.fromLocal)
    : await downloadArchive();
  execFileSync("tar", ["-xf", archive, "-C", staging], { stdio: "inherit" });

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });
  cpSync(staging, outputRoot, { recursive: true });

  rewriteSharedImports(outputRoot);
  console.log(`Fetched ${assetName} from antikythera ${manifest.ref}.`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

/**
 * Points imports of compas_pb's schemas at compas_pb_ts.
 *
 * antikythera.proto imports compas_pb/generated/message.proto, so protoc-gen-es emits a
 * relative import for it. Vendoring a second copy would register a competing file
 * descriptor for compas_pb.data, and the two runtimes would then disagree about the types
 * they are supposed to share -- so the import is rewritten to the published module.
 */
function rewriteSharedImports(root) {
  for (const entry of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }
    const file = path.join(entry.parentPath ?? entry.path, entry.name);
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(
      /from "\.\/compas_pb\/generated\/(\w+)_pb(\.js)?"/g,
      'from "@gramaziokohler/compas-pb-ts/proto/compas_pb/generated/$1_pb"',
    );
    if (rewritten !== source) {
      writeFileSync(file, rewritten);
      console.log(
        `Rewrote shared compas_pb imports in ${path.relative(root, file)}`,
      );
    }
  }
}

function localArchive(localPath) {
  const archive = path.resolve(
    projectRoot,
    localPath,
    "dist",
    "proto",
    assetName,
  );
  if (!existsSync(archive)) {
    throw new Error(
      `No ${assetName} in the local checkout. Run "invoke create-class-assets" in antikythera first.\n  looked for: ${archive}`,
    );
  }
  console.log(`Using local build: ${archive}`);
  return archive;
}

async function downloadArchive() {
  const url = `${manifest.repository.replace(/\.git$/, "")}/releases/download/${manifest.ref}/${assetName}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${assetName}: ${response.status} ${response.statusText}\n  ${url}\n` +
        `  If antikythera ${manifest.ref} predates published bindings, build them from a local\n` +
        `  checkout instead: npm run proto -- --from-local ../antikythera`,
    );
  }
  const archive = path.join(staging, assetName);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  return archive;
}

function parseArguments(argv) {
  const parsed = { fromLocal: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--from-local") {
      parsed.fromLocal = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return parsed;
}
