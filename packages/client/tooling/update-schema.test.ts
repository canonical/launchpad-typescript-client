import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { describe, it } from "vitest";
import createGeneratorProject from "../testing/createGeneratorProject.ts";
import { fakeConverterCli } from "../testing/fixtures.ts";

describe("schema refresh", () => {
  it("selects each converter environment and saves its actual version and source hash", async () => {
    const root = await createGeneratorProject();
    try {
      await mkdir(new URL("converter/dist/", root), { recursive: true });
      await writeFile(
        new URL("converter/package.json", root),
        JSON.stringify({
          name: "@canonical/launchpad-openapi",
          version: "9.8.7",
          type: "module",
          bin: { "launchpad-openapi": "dist/index.js" },
        }),
      );
      await writeFile(
        new URL("converter/dist/index.js", root),
        fakeConverterCli,
      );
      execFileSync(
        process.execPath,
        ["tooling/update-schema.ts", "--converter", "converter"],
        { cwd: root, stdio: "pipe" },
      );
      for (const environment of ["production", "qastaging"]) {
        const source = await readFile(
          new URL(`schema/${environment}/openapi.json`, root),
          "utf8",
        );
        const provenance = JSON.parse(
          await readFile(
            new URL(`schema/${environment}/provenance.json`, root),
            "utf8",
          ),
        );
        assert.equal(
          provenance.converter,
          "@canonical/launchpad-openapi@9.8.7 (local upstream)",
        );
        assert.equal(
          provenance.specSha256,
          createHash("sha256").update(source).digest("hex"),
        );
        assert.equal(
          JSON.parse(source).servers[0].url,
          `https://api.${environment === "production" ? "" : "qastaging."}launchpad.net/devel`,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
