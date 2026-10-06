import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import type {
  GenerationReport,
  Operation,
  OperationMetadata,
  SchemaBinding,
} from "./types.ts";

function renderOperations(operations: Record<string, Operation>): string {
  const runtimeOperations: Record<string, OperationMetadata> =
    Object.create(null);
  for (const [id, operation] of Object.entries(operations)) {
    // Keep transport metadata independent of schemas and validation runtime.
    const {
      method,
      template,
      fixedQuery,
      bodyMediaTypes,
      requiredPath,
      queryRequired,
      bodyRequired,
      sourcePath,
    } = operation;
    runtimeOperations[id] = {
      method,
      template,
      fixedQuery,
      bodyMediaTypes,
      requiredPath,
      queryRequired,
      bodyRequired,
      sourcePath,
    };
  }
  return [
    "/** Routing and wire encoding metadata; contains no validation runtime. */",
    "export interface OperationMetadata {",
    "  readonly method: string;",
    "  readonly template: string;",
    "  readonly fixedQuery: readonly (readonly [string, string])[];",
    "  readonly bodyMediaTypes: readonly string[];",
    "  readonly requiredPath: readonly string[];",
    "  readonly queryRequired: boolean;",
    "  readonly bodyRequired: boolean;",
    "  readonly sourcePath: string;",
    "}",
    "export const operations: Readonly<Record<string, OperationMetadata>> = {",
    ...Object.entries(runtimeOperations).map(
      ([id, operation]) =>
        `  [${JSON.stringify(id)}]: ${JSON.stringify(operation)},`,
    ),
    "};",
    "Object.setPrototypeOf(operations, null);",
    "",
  ].join("\n");
}

/**
 * Render the input or output type of a bound schema, or unknown if absent.
 * @note Registers type-only module aliases in first-use order for the imports.
 */
function renderSchemaType(
  binding: SchemaBinding | undefined,
  direction: "input" | "output",
  modules: Map<string, string>,
): string {
  if (!binding) return "unknown";
  if (!modules.has(binding.file)) modules.set(binding.file, `S${modules.size}`);
  return `z.${direction}<typeof ${modules.get(binding.file)}.${binding.name}>`;
}

/**
 * Render an operation's route choice, optional inputs, and response type.
 * @note Collects schema imports in modules while rendering type references.
 */
function renderOperationContract(
  id: string,
  operation: Operation,
  modules: Map<string, string>,
): string {
  const path = operation.schemas["request-path"];
  const route = path
    ? `({ path: ${renderSchemaType(path, "input", modules)}; resourceUrl?: never } | { resourceUrl: string; path?: never })`
    : "{ resourceUrl?: string; path?: never }";
  const fields: string[] = [];
  const query = operation.schemas["request-query"];
  if (query)
    fields.push(
      `query${operation.queryRequired ? "" : "?"}: ${renderSchemaType(query, "input", modules)}`,
    );
  const body = operation.schemas["request-body"];
  if (body)
    fields.push(
      `body${operation.bodyRequired ? "" : "?"}: ${renderSchemaType(body, "input", modules)}`,
    );
  const output = operation.hasResponseSchema
    ? renderSchemaType(operation.schemas.responses, "output", modules)
    : "unknown";
  return `  ${JSON.stringify(id)}: { input: ${route} & { ${fields.join("; ")} }; output: ${output} };`;
}

function renderContracts(operations: Record<string, Operation>): string {
  const modules = new Map<string, string>();
  const contracts = Object.entries(operations).map(([id, operation]) =>
    renderOperationContract(id, operation, modules),
  );
  const imports = [...modules].map(
    ([file, alias]) => `import type * as ${alias} from './${file}';`,
  );
  return [
    "import type { z } from 'zod';",
    ...imports,
    "export type Operations = {",
    ...contracts,
    "};",
    "export type OperationId = keyof Operations;",
    'export type Input<K extends keyof Operations> = Operations[K]["input"];',
    'export type Output<K extends keyof Operations> = Operations[K]["output"];',
    "",
  ].join("\n");
}

/**
 * Write one environment's transport metadata, type-only contracts, provenance
 * report, and grouped schemas. No generated artifact is written outside its
 * environment directory.
 *
 * @param generated - Destination directory for this environment's artifacts.
 * @param output - Temporary directory containing the generated schema modules.
 * @param report - Verified provenance and source-to-symbol bindings.
 * @note Creates or overwrites generated files and replaces the model and
 * operation schema directories to remove stale modules from earlier runs.
 */
export default async function writeGeneration(
  generated: URL,
  output: URL,
  report: GenerationReport,
): Promise<void> {
  await mkdir(generated, { recursive: true });
  await writeFile(
    new URL("operations.ts", generated),
    renderOperations(report.operations),
  );
  await writeFile(
    new URL("contracts.ts", generated),
    renderContracts(report.operations),
  );
  if (report.resourceSchemaCount !== report.sourceSchemaCount)
    throw new Error("Generator dropped component schemas");
  await writeFile(
    new URL("generation.json", generated),
    JSON.stringify(report, null, 2) + "\n",
  );
  for (const directory of ["models", "operations"]) {
    const destination = new URL(`schemas/${directory}/`, generated);
    await rm(destination, { recursive: true, force: true });
    await cp(new URL(`schemas/${directory}/`, output), destination, {
      recursive: true,
    });
  }
}
