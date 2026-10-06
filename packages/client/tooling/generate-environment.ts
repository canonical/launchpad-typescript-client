import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONVERTER_PATTERN, ENVIRONMENTS } from "./constants.ts";
import generateSchemas from "./generate-schemas.ts";
import { prepareGeneration } from "./prepare-generation.ts";
import type {
  Environment,
  GenerationReport,
  OpenApiDocument,
} from "./types.ts";
import writeGeneration from "./write-generation.ts";

interface VerifiedSnapshot {
  spec: OpenApiDocument;
  sourceFile: string;
  specSha256: string;
  converter: string;
}

/**
 * Load a saved OpenAPI snapshot only if its hash and converter provenance agree.
 * @note Reads the snapshot and provenance files; never fetches or rewrites them.
 */
async function loadSnapshot(
  root: URL,
  environment: Environment,
): Promise<VerifiedSnapshot> {
  const sourceFile = `schema/${environment}/openapi.json`;
  const source = await readFile(new URL(`../${sourceFile}`, root), "utf8");
  const specSha256 = createHash("sha256").update(source).digest("hex");
  const provenance: { specSha256?: unknown; converter?: unknown } = JSON.parse(
    await readFile(
      new URL(`../schema/${environment}/provenance.json`, root),
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
 * Generate one environment from its saved snapshot in this isolated process.
 * Adapt generator input, bind schemas to source locations, and write artifacts
 * only within that environment's generated directory.
 * @note Reads local files, runs the pinned generator, writes artifacts, and logs
 * counts. Removes temporary generator output even when generation fails.
 */
async function generateEnvironment(environment: Environment): Promise<void> {
  const root = new URL("./", import.meta.url);
  const snapshot = await loadSnapshot(root, environment);
  const prepared = prepareGeneration(snapshot.spec);
  const output = pathToFileURL(
    `${await mkdtemp(fileURLToPath(new URL(".generation-", root)))}/`,
  );

  try {
    const { components, schemaBindings } = await generateSchemas(
      prepared,
      output,
    );
    const report: GenerationReport = {
      environment,
      sourceFile: snapshot.sourceFile,
      servers: snapshot.spec.servers,
      generator: "@hey-api/openapi-ts@0.99.0",
      typescript: "6.0.3",
      zod: "4.4.3",
      specSha256: snapshot.specSha256,
      converter: snapshot.converter,
      shared: "@hey-api/shared@0.5.0",
      operationCount: Object.keys(prepared.operations).length,
      alternativePathCount: prepared.alternativePathCount,
      routeCoverage: snapshot.spec["x-launchpad-route-coverage"],
      resourceSchemaCount: Object.keys(components).length,
      sourceSchemaCount: Object.keys(snapshot.spec.components?.schemas ?? {})
        .length,
      groupedModules: new Set(schemaBindings.map((binding) => binding.file))
        .size,
      checkedPathParameters: prepared.checkedPathParameters,
      explicitOpenObjects: prepared.explicitOpenObjects,
      schemaBindings,
      components,
      operations: prepared.operations,
    };
    await writeGeneration(
      new URL(`../src/generated/${environment}/`, root),
      output,
      report,
    );
    console.log(
      JSON.stringify(
        {
          environment,
          operationCount: report.operationCount,
          sourceSchemaCount: report.sourceSchemaCount,
          alternativePathCount: report.alternativePathCount,
          schemaBindingCount: schemaBindings.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

const environment = ENVIRONMENTS.find((value) => value === process.argv[2]);
if (environment === undefined)
  throw new TypeError(`Unsupported schema environment ${process.argv[2]}`);
await generateEnvironment(environment);
