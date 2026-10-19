import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import createGeneratorProject from "../../../testing/createGeneratorProject.ts";
import { environmentSchemaConsumer } from "../../../testing/fixtures.ts";

const QASTAGING_HASH_MISMATCH_PATTERN =
  /Snapshot provenance hash mismatch for qastaging/;

describe("package release", () => {
  it("packs freshly generated contracts and schemas, refusing invalid snapshot provenance", async () => {
    const root = await createGeneratorProject();
    try {
      for (const path of [
        "package.json",
        "tsconfig.json",
        "tsconfig.build.json",
        "tooling/package.json",
      ])
        await cp(
          new URL(`../../../${path}`, import.meta.url),
          new URL(path, root),
        );
      for (const environment of ["production", "qastaging"]) {
        const directory = new URL(
          `src/generated/${environment}/schemas/operations/`,
          root,
        );
        await mkdir(directory, { recursive: true });
        await writeFile(
          new URL("stale.gen.ts", directory),
          "invalid TypeScript",
        );
      }
      await mkdir(new URL("dist/", root));
      await writeFile(new URL("dist/stale.js", root), "stale build");

      execFileSync("npm", ["pack"], { cwd: root, stdio: "pipe" });
      const archive = (await readdir(root)).find((path) =>
        path.endsWith(".tgz"),
      );
      assert.ok(archive);
      const files = new Set(
        execFileSync("tar", ["-tzf", archive], { cwd: root, encoding: "utf8" })
          .trim()
          .split("\n")
          .map((path) => path.replace("package/", "")),
      );
      for (const environment of ["production", "qastaging"])
        for (const extension of ["js", "d.ts"])
          assert.ok(
            files.has(`dist/generated/${environment}/contracts.${extension}`),
          );
      assert.equal(
        [...files].some((path) => path.includes("stale")),
        false,
      );

      execFileSync("tar", ["-xzf", archive, "-C", fileURLToPath(root)], {
        cwd: root,
        stdio: "pipe",
      });
      await writeFile(
        new URL("package/consumer.js", root),
        environmentSchemaConsumer,
      );
      execFileSync(process.execPath, ["consumer.js"], {
        cwd: new URL("package/", root),
        stdio: "pipe",
      });

      const provenance = new URL("schema/qastaging/provenance.json", root);
      const saved = JSON.parse(await readFile(provenance, "utf8"));
      await writeFile(
        provenance,
        JSON.stringify({ ...saved, specSha256: "stale" }),
      );
      assert.throws(
        () => execFileSync("npm", ["pack"], { cwd: root, stdio: "pipe" }),
        QASTAGING_HASH_MISMATCH_PATTERN,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
