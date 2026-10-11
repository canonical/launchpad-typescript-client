import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import createGeneratorProject from "../../../testing/createGeneratorProject.ts";
import {
  nestedOperationOpenApi,
  nestedRequestConsumer,
  nestedRequestTypeConsumer,
} from "../../../testing/fixtures.ts";

const compiler = fileURLToPath(
  new URL("../../../tooling/node_modules/typescript/bin/tsc", import.meta.url),
);

describe("nested requests", () => {
  it("exposes upstream dotted IDs as typed methods using the existing request transport", async () => {
    const root = await createGeneratorProject();
    try {
      const source = JSON.stringify(nestedOperationOpenApi);
      const snapshot = new URL("schema/production/openapi.json", root);
      await writeFile(snapshot, source);
      await writeFile(
        new URL("schema/production/provenance.json", root),
        JSON.stringify({
          converter: "@canonical/launchpad-openapi@0.0.6 (local upstream)",
          specSha256: createHash("sha256").update(source).digest("hex"),
        }),
      );
      execFileSync(
        process.execPath,
        ["tooling/generation/runEnvironment.ts", "production"],
        { cwd: root, stdio: "pipe" },
      );
      execFileSync(
        process.execPath,
        [
          compiler,
          "--module",
          "NodeNext",
          "--target",
          "ES2023",
          "--strict",
          "--declaration",
          "--outDir",
          "dist",
          "--rootDir",
          "src",
          "src/index.ts",
        ],
        { cwd: root, stdio: "pipe" },
      );
      await writeFile(new URL("consumer.js", root), nestedRequestConsumer);
      execFileSync(process.execPath, ["consumer.js"], {
        cwd: root,
        stdio: "pipe",
      });
      await writeFile(new URL("consumer.ts", root), nestedRequestTypeConsumer);
      execFileSync(
        process.execPath,
        [
          compiler,
          "--noEmit",
          "--module",
          "NodeNext",
          "--target",
          "ES2023",
          "--strict",
          "consumer.ts",
        ],
        { cwd: root, stdio: "pipe" },
      );
      assert.equal(await readFile(snapshot, "utf8"), source);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
