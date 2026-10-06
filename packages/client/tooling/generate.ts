/**
 * Offline generation entry point for all snapshot environments.
 * @note Runs a separate generator process per environment and removes obsolete
 * single-environment artifacts only after both generations succeed.
 */
import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ENVIRONMENTS } from "./constants.ts";

// Isolate generator state between contracts; generation never fetches snapshots.
for (const environment of ENVIRONMENTS) {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL("generate-environment.ts", import.meta.url)),
      environment,
    ],
    { stdio: "inherit" },
  );
}

// Remove the obsolete single-environment layout only after both generations pass.
for (const name of [
  "contracts.ts",
  "operations.ts",
  "generation.json",
  "schemas/",
]) {
  await rm(new URL(`../src/generated/${name}`, import.meta.url), {
    recursive: true,
    force: true,
  });
}
