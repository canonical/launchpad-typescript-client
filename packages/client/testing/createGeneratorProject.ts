import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dictionaryOpenApi, qastagingDictionaryOpenApi } from "./fixtures.ts";

/**
 * Create an isolated package with source snapshots and the real generation tools.
 *
 * @returns The temporary package root; callers must remove it after use.
 * @note Writes temporary files and links the pinned generator dependencies.
 */
export default async function createGeneratorProject(): Promise<URL> {
  const root = pathToFileURL(
    `${await mkdtemp(join(tmpdir(), "launchpad-generator-"))}/`,
  );
  const tooling = new URL("../tooling/", import.meta.url);
  await symlink(
    fileURLToPath(new URL("node_modules/", tooling)),
    new URL("node_modules", root),
    "dir",
  );
  await cp(tooling, new URL("tooling/", root), {
    recursive: true,
    async filter(source) {
      const name = basename(source);
      if (name === "node_modules" || name.endsWith(".test.ts")) return false;
      // Descend into capability folders, copying only TypeScript sources.
      return name.endsWith(".ts") || (await stat(source)).isDirectory();
    },
  });
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  await writeFile(
    new URL("package.json", root),
    JSON.stringify({ name: pkg.name, type: "module", exports: pkg.exports }),
  );
  for (const [environment, spec] of Object.entries({
    production: dictionaryOpenApi,
    qastaging: qastagingDictionaryOpenApi,
  })) {
    const directory = new URL(`schema/${environment}/`, root);
    await mkdir(directory, { recursive: true });
    const source = JSON.stringify(spec);
    await writeFile(new URL("openapi.json", directory), source);
    await writeFile(
      new URL("provenance.json", directory),
      JSON.stringify({
        converter: "@canonical/launchpad-openapi@0.0.3 (local upstream)",
        specSha256: createHash("sha256").update(source).digest("hex"),
      }),
    );
  }
  return root;
}
