import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { GenerationReport } from "../../../tooling/types.ts";
import type { z } from "zod";
import createGeneratorProject from "../../../testing/createGeneratorProject.ts";
import {
  dictionaryOpenApi,
  environmentContractConsumer,
  environmentSchemaConsumer,
  moduleScopedOperationsOpenApi,
  referencedParameterOpenApi,
} from "../../../testing/fixtures.ts";

const PROVENANCE_HASH_MISMATCH_PATTERN =
  /Snapshot provenance hash mismatch for production/;

const compiler = fileURLToPath(
  new URL("../../../tooling/node_modules/typescript/bin/tsc", import.meta.url),
);

describe("schema generation", () => {
  it("defaults to qastaging while keeping environment contracts, schemas, and provenance separate", async () => {
    const root = await createGeneratorProject();
    try {
      execFileSync(process.execPath, ["tooling/generation/run.ts"], {
        cwd: root,
        stdio: "pipe",
      });
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
          "src/generated/production/contracts.ts",
          "src/generated/qastaging/contracts.ts",
          "src/index.ts",
        ],
        { cwd: root, stdio: "pipe" },
      );
      for (const [environment, operationId, path] of [
        ["production", "dictionary.get", "/dictionary"],
        ["qastaging", "dictionary.qa.get", "/qa-dictionary"],
      ]) {
        const report: GenerationReport = JSON.parse(
          await readFile(
            new URL(`src/generated/${environment}/generation.json`, root),
            "utf8",
          ),
        );
        const source = await readFile(
          new URL(`schema/${environment}/openapi.json`, root),
          "utf8",
        );
        assert.equal(report.environment, environment);
        assert.equal(
          report.converter,
          "@canonical/launchpad-openapi@0.0.3 (local upstream)",
        );
        assert.equal(
          report.specSha256,
          createHash("sha256").update(source).digest("hex"),
        );
        assert.deepEqual(Object.keys(report.operations), [operationId]);
        assert.equal(report.operations[operationId].template, path);
        for (const binding of report.schemaBindings) {
          const module = await import(
            new URL(`dist/generated/${environment}/${binding.file}`, root).href
          );
          assert.equal(typeof module[binding.name]?.safeParse, "function");
        }
        /**
         * Load a component validator through its recorded module binding.
         * @note Imports a compiled schema from the temporary test package.
         */
        async function loadSchema(name: string): Promise<z.ZodType> {
          const binding = report.components[name];
          const module = await import(
            new URL(`dist/generated/${environment}/${binding.file}`, root).href
          );
          return module[binding.name];
        }
        if (environment === "production") {
          const dictionary = await loadSchema("Dictionary");
          assert.deepEqual(dictionary.parse({ answer: 42 }), { answer: 42 });
          assert.equal(dictionary.safeParse({ answer: "42" }).success, false);
          const mixed = await loadSchema("Mixed");
          assert.deepEqual(mixed.parse({ label: "fixed", answer: 42 }), {
            label: "fixed",
            answer: 42,
          });
          assert.equal(mixed.safeParse({ answer: "42" }).success, false);
          assert.equal(
            (await loadSchema("Closed")).safeParse({ extra: 42 }).success,
            false,
          );
          assert.deepEqual(
            (await loadSchema("Open")).parse({
              extra: 42,
              nested: { label: "fixed", extra: true },
            }),
            { extra: 42, nested: { label: "fixed", extra: true } },
          );
        }
      }
      await writeFile(new URL("consumer.js", root), environmentSchemaConsumer);
      execFileSync(process.execPath, ["consumer.js"], {
        cwd: root,
        stdio: "pipe",
      });
      await writeFile(
        new URL("consumer.ts", root),
        environmentContractConsumer,
      );
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves referenced parameters without changing the snapshot", async () => {
    const root = await createGeneratorProject();
    try {
      const source = JSON.stringify(referencedParameterOpenApi);
      const snapshot = new URL("schema/production/openapi.json", root);
      await writeFile(snapshot, source);
      await writeFile(
        new URL("schema/production/provenance.json", root),
        JSON.stringify({
          converter: "@canonical/launchpad-openapi@0.0.3 (local upstream)",
          specSha256: createHash("sha256").update(source).digest("hex"),
        }),
      );
      execFileSync(
        process.execPath,
        ["tooling/generation/runEnvironment.ts", "production"],
        {
          cwd: root,
          stdio: "pipe",
        },
      );
      const report: GenerationReport = JSON.parse(
        await readFile(
          new URL("src/generated/production/generation.json", root),
          "utf8",
        ),
      );
      assert.deepEqual(report.operations["dictionary.get"].requiredPath, [
        "key",
      ]);
      assert.ok(report.operations["dictionary.get"].schemas["request-path"]);
      assert.equal(await readFile(snapshot, "utf8"), source);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves unnumbered operation schema names across resource modules", async () => {
    const root = await createGeneratorProject();
    try {
      const source = JSON.stringify(moduleScopedOperationsOpenApi);
      const snapshot = new URL("schema/production/openapi.json", root);
      await writeFile(snapshot, source);
      await writeFile(
        new URL("schema/production/provenance.json", root),
        JSON.stringify({
          converter: "@canonical/launchpad-openapi@0.1.4",
          specSha256: createHash("sha256").update(source).digest("hex"),
        }),
      );
      execFileSync(
        process.execPath,
        ["tooling/generation/runEnvironment.ts", "production"],
        {
          cwd: root,
          stdio: "pipe",
        },
      );
      const report: GenerationReport = JSON.parse(
        await readFile(
          new URL("src/generated/production/generation.json", root),
          "utf8",
        ),
      );
      for (const [id, group] of [
        ["dictionaryEntry.get", "dictionary_entry"],
        ["dictionary.entry.get", "dictionary"],
      ]) {
        assert.deepEqual(report.operations[id].schemas["request-path"], {
          file: `schemas/operations/${group}.gen.js`,
          name: "zDictionaryEntryGetPath",
        });
        assert.deepEqual(report.operations[id].schemas.responses, {
          file: `schemas/operations/${group}.gen.js`,
          name: "zDictionaryEntryGetResponse",
        });
      }
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
          "src/generated/production/contracts.ts",
        ],
        {
          cwd: root,
          stdio: "pipe",
        },
      );
      assert.equal(await readFile(snapshot, "utf8"), source);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects dotted operation IDs that collapse to the same generated symbol", async () => {
    const root = await createGeneratorProject();
    try {
      const operation = dictionaryOpenApi.paths["/dictionary"].get;
      const source = JSON.stringify({
        ...dictionaryOpenApi,
        paths: {
          "/dictionary": {
            get: { ...operation, operationId: "dictionary.fooBar.get" },
          },
          "/other": {
            get: { ...operation, operationId: "dictionary.foo.barGet" },
          },
        },
      });
      await writeFile(new URL("schema/production/openapi.json", root), source);
      await writeFile(
        new URL("schema/production/provenance.json", root),
        JSON.stringify({
          converter: "@canonical/launchpad-openapi@0.0.6 (local upstream)",
          specSha256: createHash("sha256").update(source).digest("hex"),
        }),
      );
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            ["tooling/generation/runEnvironment.ts", "production"],
            { cwd: root, stdio: "pipe" },
          ),
        /Conflicting generated symbol .*DictionaryFooBarGet.*\/dictionary.*\/other/s,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a snapshot whose saved converter provenance has a different hash", async () => {
    const root = await createGeneratorProject();
    try {
      await writeFile(
        new URL("schema/production/provenance.json", root),
        JSON.stringify({
          converter: "@canonical/launchpad-openapi@0.0.3 (local upstream)",
          specSha256: "stale",
        }),
      );
      assert.throws(
        () =>
          execFileSync(process.execPath, ["tooling/generation/run.ts"], {
            cwd: root,
            stdio: "pipe",
          }),
        PROVENANCE_HASH_MISMATCH_PATTERN,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
