import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ENVIRONMENTS } from "./constants.ts";

/**
 * Generate all environments offline, each in its own process to isolate the
 * generator's state. Leave obsolete artifacts in place if any generation fails.
 * @note Runs child processes and removes the obsolete single-environment layout
 * only after every environment has been generated successfully.
 */
async function generateEnvironments(): Promise<void> {
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
}

await generateEnvironments();
