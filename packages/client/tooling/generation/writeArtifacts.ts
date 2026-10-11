import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import buildOperationPaths from "./buildOperationPaths.ts";
import type {
  GenerationReport,
  Operation,
  OperationMetadata,
  SchemaBinding,
} from "../types.ts";

/** Select the routing and wire-encoding fields that transport needs at runtime. */
function pickOperationMetadata(operation: Operation): OperationMetadata {
  return {
    method: operation.method,
    template: operation.template,
    fixedQuery: operation.fixedQuery,
    bodyMediaTypes: operation.bodyMediaTypes,
    requiredPath: operation.requiredPath,
    queryRequired: operation.queryRequired,
    bodyRequired: operation.bodyRequired,
    sourcePath: operation.sourcePath,
  };
}

/**
 * Render transport metadata as a module that imports neither schemas nor the
 * validation runtime.
 */
function renderOperations(operations: Record<string, Operation>): string {
  return [
    "/** Routing and wire encoding metadata; contains no validation runtime. */",
    'import type { OperationId } from "./contracts.js";',
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
    ...Object.entries(operations).map(
      ([id, operation]) =>
        `  [${JSON.stringify(id)}]: ${JSON.stringify(pickOperationMetadata(operation))},`,
    ),
    "};",
    "Object.setPrototypeOf(operations, null);",
    "/** Naming hierarchy; leaves are unchanged upstream operation IDs. */",
    "export interface OperationPathNamespace {",
    "  readonly [component: string]: OperationId | OperationPathNamespace;",
    "}",
    `export const operationPaths = ${JSON.stringify(buildOperationPaths(operations))} as const satisfies OperationPathNamespace;`,
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

/** Render type-only contracts, including argument-sensitive collection outputs. */
function renderContracts(operations: Record<string, Operation>): string {
  const modules = new Map<string, string>();
  const contracts = Object.entries(operations).map(([id, operation]) =>
    renderOperationContract(id, operation, modules),
  );
  const imports = [...modules].map(
    ([file, alias]) => `import type * as ${alias} from './${file}';`,
  );
  const collectionOperations = Object.entries(operations)
    .filter(([, operation]) =>
      operation.parameters.some(
        (parameter) => parameter.in === "query" && parameter.name === "ws.show",
      ),
    )
    .map(([id]) => JSON.stringify(id));
  return [
    "import type { z } from 'zod';",
    ...imports,
    "export type Operations = {",
    ...contracts,
    "};",
    "export type OperationId = keyof Operations;",
    'export type Input<K extends keyof Operations> = Operations[K]["input"];',
    `type CollectionOperationId = ${collectionOperations.join(" | ") || "never"};`,
    // Distribute over optional queries and union inputs before inspecting keys.
    "type FieldValue<T, Key extends PropertyKey> = T extends unknown ? Key extends keyof T ? T[Key] : undefined : never;",
    "type CollectionOutput<Response, Show> =",
    "  [Response] extends [number | { start: number; entries: unknown[] }]",
    "    ? [Extract<Response, number>] extends [never] ? Response",
    "      : [Exclude<Response, number>] extends [never] ? Response",
    "      : unknown extends Show ? Response",
    '      : [Show] extends ["total_size"] ? Extract<Response, number>',
    '      : "total_size" extends Show ? Response : Exclude<Response, number>',
    "    : Response;",
    "/** Documented output, narrowed by ws.show when a concrete input is supplied. */",
    "export type Output<K extends keyof Operations, I extends Input<K> = Input<K>> =",
    "  K extends CollectionOperationId",
    '    ? CollectionOutput<Operations[K]["output"], FieldValue<FieldValue<I, "query">, "ws.show">>',
    '    : Operations[K]["output"];',
    "",
  ].join("\n");
}

/**
 * Replace the model and operation schema directories with freshly generated ones.
 * @note Removes stale modules from earlier runs before copying new output.
 */
async function replaceSchemaModules(
  generated: URL,
  output: URL,
): Promise<void> {
  for (const directory of ["models", "operations"]) {
    const destination = new URL(`schemas/${directory}/`, generated);
    await rm(destination, { recursive: true, force: true });
    await cp(new URL(`schemas/${directory}/`, output), destination, {
      recursive: true,
    });
  }
}

/**
 * Write one environment's transport metadata, type-only contracts, provenance
 * report, and grouped schemas. No generated artifact is written outside its
 * environment directory, and nothing is written if component schemas are missing.
 *
 * @param generated - Destination directory for this environment's artifacts.
 * @param output - Temporary directory containing the generated schema modules.
 * @param report - Verified provenance and source-to-symbol bindings.
 * @note Creates or overwrites generated files and replaces the schema modules.
 */
export default async function writeArtifacts(
  generated: URL,
  output: URL,
  report: GenerationReport,
): Promise<void> {
  if (report.resourceSchemaCount !== report.sourceSchemaCount)
    throw new Error("Generator dropped component schemas");
  await mkdir(generated, { recursive: true });
  await writeFile(
    new URL("operations.ts", generated),
    renderOperations(report.operations),
  );
  await writeFile(
    new URL("contracts.ts", generated),
    renderContracts(report.operations),
  );
  await writeFile(
    new URL("generation.json", generated),
    JSON.stringify(report, null, 2) + "\n",
  );
  await replaceSchemaModules(generated, output);
}
