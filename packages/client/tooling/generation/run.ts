import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ENVIRONMENTS } from "../constants.ts";

/**
 * Generate every environment offline, each in its own process because the
 * generator retains process-wide state.
 * @note Runs one child process per environment and stops at the first failure.
 */
function generateEnvironments(): void {
  const script = fileURLToPath(new URL("runEnvironment.ts", import.meta.url));
  for (const environment of ENVIRONMENTS)
    execFileSync(process.execPath, [script, environment], { stdio: "inherit" });
}

generateEnvironments();
