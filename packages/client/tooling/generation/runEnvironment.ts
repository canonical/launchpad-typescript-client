import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONVERTER_PATTERN, ENVIRONMENTS, PACKAGE_ROOT } from "../constants.ts";
import type {
  Environment,
  GenerationReport,
  OpenApiDocument,
  PreparedGeneration,
  SchemaBindings,
} from "../types.ts";
import emitSchemas from "./emitSchemas.ts";
import prepareInput from "./prepareInput.ts";
import writeArtifacts from "./writeArtifacts.ts";

interface VerifiedSnapshot {
  spec: OpenApiDocument;
  sourceFile: string;
  specSha256: string;
  converter: string;
}

type Toolchain = Pick<
  GenerationReport,
  "generator" | "typescript" | "zod" | "shared"
>;

/**
 * Load a saved OpenAPI snapshot only if its hash and converter provenance agree.
 * @note Reads the snapshot and provenance files; never fetches or rewrites them.
 */
async function loadSnapshot(
  environment: Environment,
): Promise<VerifiedSnapshot> {
  const sourceFile = `schema/${environment}/openapi.json`;
  const source = await readFile(new URL(sourceFile, PACKAGE_ROOT), "utf8");
  const specSha256 = createHash("sha256").update(source).digest("hex");
  const provenance: { specSha256?: unknown; converter?: unknown } = JSON.parse(
    await readFile(
      new URL(`schema/${environment}/provenance.json`, PACKAGE_ROOT),
      "utf8",
    ),
  );
  if (provenance.specSha256 !== specSha256)
    throw new Error(`Snapshot provenance hash mismatch for ${environment}`);
  const converter = provenance.converter;
  if (typeof converter !== "string" || !CONVERTER_PATTERN.test(converter))
    throw new TypeError(`Invalid converter provenance for ${environment}`);
  // The adapter validates its structural assumptions during preparation;
  // it does not infer or repair schemas in the upstream OpenAPI contract.
  return { spec: JSON.parse(source), sourceFile, specSha256, converter };
}

/**
 * Read the installed version of a generation dependency.
 * @note Reads the package manifest resolved from this tooling package.
 */
async function readInstalledVersion(name: string): Promise<string> {
  const manifest = createRequire(import.meta.url).resolve(
    `${name}/package.json`,
  );
  const { version }: { version?: unknown } = JSON.parse(
    await readFile(manifest, "utf8"),
  );
  if (typeof version !== "string")
    throw new TypeError(`Missing installed version for ${name}`);
  return version;
}

/**
 * Identify the installed generator toolchain for generation provenance.
 * @note Reads the installed package manifests.
 */
async function loadToolchain(): Promise<Toolchain> {
  const [generator, typescript, zod, shared] = await Promise.all(
    ["@hey-api/openapi-ts", "typescript", "zod", "@hey-api/shared"].map(
      readInstalledVersion,
    ),
  );
  return {
    generator: `@hey-api/openapi-ts@${generator}`,
    typescript,
    zod,
    shared: `@hey-api/shared@${shared}`,
  };
}

/** Assemble provenance and counts from the verified snapshot and bound schemas. */
function buildGenerationReport(
  environment: Environment,
  snapshot: VerifiedSnapshot,
  toolchain: Toolchain,
  prepared: PreparedGeneration,
  { components, schemaBindings }: SchemaBindings,
): GenerationReport {
  return {
    environment,
    sourceFile: snapshot.sourceFile,
    servers: snapshot.spec.servers,
    ...toolchain,
    specSha256: snapshot.specSha256,
    converter: snapshot.converter,
    operationCount: Object.keys(prepared.operations).length,
    alternativePathCount: prepared.alternativePathCount,
    routeCoverage: snapshot.spec["x-launchpad-route-coverage"],
    resourceSchemaCount: Object.keys(components).length,
    sourceSchemaCount: Object.keys(snapshot.spec.components?.schemas ?? {})
      .length,
    groupedModules: new Set(schemaBindings.map((binding) => binding.file)).size,
    checkedPathParameters: prepared.checkedPathParameters,
    explicitOpenObjects: prepared.explicitOpenObjects,
    schemaBindings,
    components,
    operations: prepared.operations,
  };
}

/**
 * Print the environment's generation counts.
 * @note Writes a JSON summary to stdout after artifacts have been saved.
 */
function logGenerationSummary(report: GenerationReport): void {
  console.log(
    JSON.stringify(
      {
        environment: report.environment,
        operationCount: report.operationCount,
        sourceSchemaCount: report.sourceSchemaCount,
        alternativePathCount: report.alternativePathCount,
        schemaBindingCount: report.schemaBindings.length,
      },
      null,
      2,
    ),
  );
}

/**
 * Generate one environment from its saved snapshot in this isolated process.
 * Adapt generator input, bind schemas to source locations, and write artifacts
 * only within that environment's generated directory.
 * @note Reads local files, runs the pinned generator, writes artifacts, and logs
 * counts. Removes temporary generator output even when generation fails.
 */
async function generateEnvironment(environment: Environment): Promise<void> {
  const snapshot = await loadSnapshot(environment);
  const toolchain = await loadToolchain();
  const prepared = prepareInput(snapshot.spec);
  const output = pathToFileURL(
    `${await mkdtemp(fileURLToPath(new URL("tooling/.generation-", PACKAGE_ROOT)))}/`,
  );

  try {
    const bindings = await emitSchemas(prepared, output);
    const report = buildGenerationReport(
      environment,
      snapshot,
      toolchain,
      prepared,
      bindings,
    );
    await writeArtifacts(
      new URL(`src/generated/${environment}/`, PACKAGE_ROOT),
      output,
      report,
    );
    logGenerationSummary(report);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

const environment = ENVIRONMENTS.find((value) => value === process.argv[2]);
if (environment === undefined)
  throw new TypeError(`Unsupported schema environment ${process.argv[2]}`);
await generateEnvironment(environment);
