import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  await mkdir(new URL("tooling/", root));
  await symlink(
    fileURLToPath(new URL("node_modules/", tooling)),
    new URL("node_modules", root),
    "dir",
  );
  for (const name of await readdir(tooling)) {
    if (name.endsWith(".ts") && !name.endsWith(".test.ts"))
      await cp(new URL(name, tooling), new URL(`tooling/${name}`, root));
  }
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
