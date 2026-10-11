import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CONVERTER_PATTERN, ENVIRONMENTS, PACKAGE_ROOT } from "../constants.ts";
import type { Environment } from "../types.ts";

interface RefreshOptions {
  environments: readonly Environment[];
  /** Local converter checkout; the installed converter is used when absent. */
  converterPath?: string;
}

/** A converter executable and the provenance label recorded for its output. */
interface Converter {
  executable: string;
  label: string;
}

/**
 * Read the environments and converter to use from the command line.
 * @note Reads process arguments.
 */
function parseOptions(): RefreshOptions {
  const { values } = parseArgs({
    options: { environment: { type: "string" }, converter: { type: "string" } },
  });
  if (values.environment === undefined)
    return { environments: ENVIRONMENTS, converterPath: values.converter };
  const environment = ENVIRONMENTS.find(
    (value) => value === values.environment,
  );
  if (environment === undefined)
    throw new TypeError(`Unsupported schema environment ${values.environment}`);
  return { environments: [environment], converterPath: values.converter };
}

/**
 * Locate the Launchpad OpenAPI converter and label it with its actual version.
 * @note Reads the converter's package manifest.
 */
async function resolveConverter(
  converterPath: string | undefined,
): Promise<Converter> {
  const packageFile =
    converterPath === undefined
      ? pathToFileURL(
          createRequire(import.meta.url).resolve(
            "@canonical/launchpad-openapi/package.json",
          ),
        )
      : pathToFileURL(resolve(converterPath, "package.json"));
  const pkg: {
    name?: unknown;
    version?: unknown;
    bin?: Record<string, unknown>;
  } = JSON.parse(await readFile(packageFile, "utf8"));
  const bin = pkg.bin?.["launchpad-openapi"];
  if (pkg.name !== "@canonical/launchpad-openapi" || typeof bin !== "string")
    throw new TypeError("Expected a Launchpad OpenAPI converter package");
  const label = `${pkg.name}@${pkg.version}${converterPath === undefined ? "" : " (local upstream)"}`;
  if (!CONVERTER_PATTERN.test(label))
    throw new TypeError("Invalid converter version");
  return { executable: fileURLToPath(new URL(bin, packageFile)), label };
}

/**
 * Convert one environment's API description and save it verbatim, alongside the
 * converter label and a hash of the saved source.
 * @note Runs the converter, writes its output to the temporary directory, then
 * overwrites the environment's snapshot and provenance files.
 */
async function refreshSnapshot(
  environment: Environment,
  converter: Converter,
  temporary: string,
): Promise<void> {
  const output = join(temporary, `${environment}.json`);
  const target =
    environment === "production"
      ? ["--instance", "launchpad.net"]
      : ["--environment", environment];
  execFileSync(
    process.execPath,
    [converter.executable, ...target, "--format", "json", "--output", output],
    { stdio: "inherit" },
  );
  const source = await readFile(output, "utf8");
  const destination = new URL(`schema/${environment}/`, PACKAGE_ROOT);
  await mkdir(destination, { recursive: true });
  // Import the converter output verbatim, never rewrite the upstream contract.
  await writeFile(new URL("openapi.json", destination), source);
  await writeFile(
    new URL("provenance.json", destination),
    JSON.stringify(
      {
        converter: converter.label,
        specSha256: createHash("sha256").update(source).digest("hex"),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Updated ${environment} schema using ${converter.label}`);
}

/**
 * Refresh the selected snapshots from the upstream converter. This is the only
 * tooling step that may access Launchpad; generation works offline afterwards.
 * @note Runs the converter and rewrites snapshots. Removes temporary converter
 * output even when a refresh fails.
 */
async function refreshSnapshots(): Promise<void> {
  const { environments, converterPath } = parseOptions();
  const converter = await resolveConverter(converterPath);
  const temporary = await mkdtemp(join(tmpdir(), "launchpad-schema-"));
  try {
    for (const environment of environments)
      await refreshSnapshot(environment, converter, temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await refreshSnapshots();
