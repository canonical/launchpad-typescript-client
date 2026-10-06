/**
 * Explicit network refresh entry point, separate from offline generation.
 * @note Runs the selected upstream converter and imports its output verbatim,
 * recording the actual converter version and a hash of each saved snapshot.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CONVERTER_PATTERN, ENVIRONMENTS } from "./constants.ts";

const { values } = parseArgs({
  options: { environment: { type: "string" }, converter: { type: "string" } },
});
if (
  values.environment !== undefined &&
  !ENVIRONMENTS.some((environment) => environment === values.environment)
)
  throw new TypeError(`Unsupported schema environment ${values.environment}`);
const packageFile =
  values.converter === undefined
    ? pathToFileURL(
        createRequire(import.meta.url).resolve(
          "@canonical/launchpad-openapi/package.json",
        ),
      )
    : pathToFileURL(resolve(values.converter, "package.json"));
const pkg: {
  name?: unknown;
  version?: unknown;
  bin?: Record<string, unknown>;
} = JSON.parse(await readFile(packageFile, "utf8"));
if (
  pkg.name !== "@canonical/launchpad-openapi" ||
  typeof pkg.bin?.["launchpad-openapi"] !== "string"
)
  throw new TypeError("Expected a Launchpad OpenAPI converter package");
const converter = `${pkg.name}@${pkg.version}${values.converter === undefined ? "" : " (local upstream)"}`;
if (!CONVERTER_PATTERN.test(converter))
  throw new TypeError("Invalid converter version");
const executable = fileURLToPath(
  new URL(pkg.bin["launchpad-openapi"], packageFile),
);
const temporary = await mkdtemp(join(tmpdir(), "launchpad-schema-"));
try {
  for (const environment of values.environment === undefined
    ? ENVIRONMENTS
    : [values.environment]) {
    const output = join(temporary, `${environment}.json`);
    execFileSync(
      process.execPath,
      [
        executable,
        ...(environment === "production"
          ? ["--instance", "launchpad.net"]
          : ["--environment", environment]),
        "--format",
        "json",
        "--output",
        output,
      ],
      { stdio: "inherit" },
    );
    const source = await readFile(output, "utf8");
    const destination = new URL(`../schema/${environment}/`, import.meta.url);
    await mkdir(destination, { recursive: true });
    // Import the converter output verbatim, never rewrite the upstream contract.
    await writeFile(new URL("openapi.json", destination), source);
    await writeFile(
      new URL("provenance.json", destination),
      JSON.stringify(
        {
          converter,
          specSha256: createHash("sha256").update(source).digest("hex"),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Updated ${environment} schema using ${converter}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
