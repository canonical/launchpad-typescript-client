/**
 * Generate one environment in an isolated process using the pinned generator.
 *
 * Adapt routing and serialization metadata, then bind generated symbols back to
 * their source locations. The snapshot is never rewritten or type-corrected here.
 * @note Reads the snapshot and provenance, writes generated artifacts, and removes
 * temporary generator output even when generation fails.
 */
import { createClient } from "@hey-api/openapi-ts";
import { childContext, type OpenApi } from "@hey-api/shared";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { CONVERTER_PATTERN, ENVIRONMENTS, HTTP_METHODS } from "./constants.ts";
import type {
  GenerationReport,
  GeneratorSymbol,
  HttpMethod,
  Operation,
  OperationMetadata,
  Parameter,
  PathItem,
  Reference,
  RequestBody,
  ResponseObject,
  SchemaBinding,
  SymbolMetadata,
} from "./types.ts";

const root = new URL("./", import.meta.url);
const environment = ENVIRONMENTS.find((value) => value === process.argv[2]);
if (environment === undefined)
  throw new TypeError(`Unsupported schema environment ${process.argv[2]}`);
const generated = new URL(`../src/generated/${environment}/`, root);
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
// The snapshot is an upstream OpenAPI contract. The adapter validates its own
// structural assumptions below; it does not infer or repair resource schemas.
const spec: OpenApi.V3_0_X & { paths: Record<string, PathItem> } =
  JSON.parse(source);
const paths = spec.paths;
const operations: Record<string, Operation> = Object.create(null);
const groups = new Set<string>();

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
let checkedPathParameters = 0;
let explicitOpenObjects = 0;

/**
 * Resolve a local JSON Pointer, preserving the type of its OpenAPI source location.
 * Reject unresolved references and reference cycles rather than inventing schemas.
 */
function resolveReference<T extends object>(
  value: T | Reference,
  seen = new Set<string>(),
): T {
  if (!value || typeof value !== "object")
    throw new TypeError("Invalid referenced OpenAPI value");
  if (!("$ref" in value) || !value.$ref) return value as T;
  const ref = value.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/"))
    throw new Error(`Unsupported reference ${ref}`);
  if (seen.has(ref)) throw new Error(`Cyclic structural reference ${ref}`);
  seen.add(ref);
  let target: unknown = spec;
  for (const segment of ref.slice(2).split("/")) {
    const key = decodeURIComponent(segment)
      .replace(/~1/g, "/")
      .replace(/~0/g, "~");
    if (
      target === null ||
      typeof target !== "object" ||
      !Object.hasOwn(target, key)
    )
      throw new Error(`Unresolved reference ${ref}`);
    target = Reflect.get(target, key);
  }
  if (!isRecord(target))
    throw new TypeError("Invalid referenced OpenAPI value");
  // A reference has the type of its source location in the upstream document.
  return resolveReference<T>(target as T | Reference, seen);
}

function rejectDefaults(node: unknown, visited = new Set<object>()): void {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);
  if (Object.hasOwn(node, "default"))
    throw new Error("Path parameter schema contains a default");
  if (isRecord(node) && node.$ref)
    rejectDefaults(resolveReference(node), visited);
  for (const child of Object.values(node)) rejectDefaults(child, visited);
}

/**
 * Make OpenAPI's default open-object behavior explicit for the Zod generator.
 * @note Mutates only the parsed generation input, never the source snapshot.
 */
function preserveOpenObjects(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  if (
    isRecord(node) &&
    node.type === "object" &&
    node.additionalProperties === undefined
  ) {
    node.additionalProperties = true;
    explicitOpenObjects++;
  }
  for (const child of Object.values(node)) preserveOpenObjects(child);
}
preserveOpenObjects(spec);

// Give colliding routes unique generator-only keys; transport keeps source URLs.
const alternativePaths = new Map<string, string>();
/**
 * Include colliding route alternatives under unique generator-only path keys.
 * @note Extends the parsed path map; source URLs are retained in alternativePaths.
 */
function includeAlternatives(item: PathItem): void {
  const alternatives = item["x-launchpad-route-alternatives"];
  if (alternatives === undefined) return;
  if (!Array.isArray(alternatives))
    throw new TypeError("Expected an array of Launchpad route alternatives");
  for (const alternative of alternatives) {
    if (
      !isRecord(alternative) ||
      typeof alternative.path !== "string" ||
      !alternative.path.startsWith("/") ||
      !isRecord(alternative.item)
    ) {
      throw new TypeError("Invalid Launchpad route alternative");
    }
    const key = `/__launchpad_alternatives/${alternativePaths.size}${alternative.path}`;
    if (Object.hasOwn(paths, key))
      throw new Error(`Conflicting generator-only path ${key}`);
    alternativePaths.set(key, alternative.path);
    paths[key] = alternative.item;
    includeAlternatives(alternative.item);
  }
}
for (const item of Object.values(paths)) includeAlternatives(item);

for (const [path, item] of Object.entries(paths)) {
  for (const method of Object.keys(item)) {
    if (!isHttpMethod(method)) continue;
    const operation = item[method];
    if (operation === undefined) continue;
    const id = operation.operationId;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      Object.hasOwn(operations, id)
    )
      throw new Error(`Missing or duplicate operationId at ${method} ${path}`);
    for (const tag of operation.tags ?? []) groups.add(tag);
    const parameters = [
      ...(item.parameters ?? []),
      ...(operation.parameters ?? []),
    ].map((parameter) => resolveReference<Parameter>(parameter));
    const requestBody =
      operation.requestBody &&
      resolveReference<RequestBody>(operation.requestBody);
    for (const entry of parameters) {
      const parameter = resolveReference(entry);
      if (parameter.in === "path") {
        rejectDefaults(parameter.schema);
        for (const media of Object.values(parameter.content ?? {}))
          rejectDefaults(media.schema);
        checkedPathParameters++;
      }
    }
    const sourcePath = alternativePaths.get(path) ?? path;
    const separator = sourcePath.indexOf("?");
    const template =
      separator === -1 ? sourcePath : sourcePath.slice(0, separator);
    const fixedQuery =
      separator === -1
        ? []
        : [...new URLSearchParams(sourcePath.slice(separator + 1))];
    const bodyMediaTypes = Object.keys(requestBody?.content ?? {});
    operations[id] = {
      method: method.toUpperCase(),
      template,
      fixedQuery,
      bodyMediaTypes,
      requiredPath: parameters
        .filter((p) => p.in === "path")
        .map((p) => p.name),
      queryRequired: parameters.some((p) => p.in === "query" && p.required),
      bodyRequired: requestBody?.required === true,
      sourcePath,
      sourceLocation: ["paths", path, method],
      parameters,
      requestBody,
      responses: (operation.responses ?? {}) as Operation["responses"],
      schemas: Object.create(null),
    };
  }
}

const output = new URL(
  `${await mkdtemp(fileURLToPath(new URL(".generation-", root)))}/`,
  "file://",
);
try {
  const symbols = new Map<
    number,
    {
      symbol: GeneratorSymbol;
      meta: SymbolMetadata;
      file: string;
    }
  >();
  function selectResourceGroup(meta: SymbolMetadata): string {
    if (meta.resource === "operation" && meta.tags?.length) return meta.tags[0];
    if (meta.resource === "definition") {
      const name = meta.path?.[2];
      if (typeof name !== "string")
        throw new Error("Definition has no source schema name");
      const group = name.replace(/-(full|diff|page|json)$/, "");
      if (groups.has(group)) return group;
    }
    return "shared";
  }

  await createClient({
    input: { ...spec },
    output: {
      path: fileURLToPath(output),
      entryFile: false,
      module: { extension: ".js" },
    },
    parser: {
      hooks: {
        symbols: {
          getFilePath(symbol) {
            const meta = symbol.meta;
            if (meta?.artifact !== "zod") return;
            const group = selectResourceGroup(meta);
            if (!/^[a-zA-Z0-9_-]+$/.test(group))
              throw new Error(`Invalid resource group ${group}`);
            const directory =
              meta.resource === "definition" ? "models" : "operations";
            const file = `schemas/${directory}/${group}.gen.js`;
            if (meta.category === "schema")
              symbols.set(symbol.id, { symbol, meta, file });
            return `schemas/${directory}/${group}`;
          },
        },
      },
    },
    plugins: [
      {
        name: "zod",
        compatibilityVersion: 4,
        dates: { offset: true },
        types: { infer: true },
        $resolvers: {
          object(ctx) {
            const additional = ctx.schema.additionalProperties;
            const closed = additional === false || additional?.type === "never";
            let object = ctx
              .$(ctx.symbols.z)
              .attr(closed ? "strictObject" : "looseObject")
              .call(ctx.nodes.shape(ctx));
            if (additional && !closed && additional.type !== "unknown") {
              const { _childResults: childResults } = ctx;
              const child = ctx.walk(
                additional,
                childContext(ctx, "additionalProperties"),
              );
              childResults.push(child);
              object = object
                .attr("catchall")
                .call(ctx.applyModifiers(child, {}).chain);
            }
            return object;
          },
        },
      },
    ],
  });

  const resources: Record<string, SchemaBinding> = Object.create(null);
  const schemaBindings: GenerationReport["schemaBindings"] = [];
  for (const { symbol, meta, file } of symbols.values()) {
    const binding = { file, name: symbol.finalName ?? symbol.name };
    if (typeof binding.name !== "string" || !binding.name)
      throw new Error("Schema symbol has no final name");
    schemaBindings.push({ ...binding, source: meta });
    // Parameter and response components can also produce definition symbols.
    // Only components/schemas contribute to resource-schema completeness.
    if (meta.resource === "definition" && meta.path?.[1] === "schemas") {
      const name = meta.path?.[2];
      if (typeof name !== "string")
        throw new Error("Definition has no source schema name");
      if (Object.hasOwn(resources, name))
        throw new Error(`Duplicate component binding ${name}`);
      resources[name] = binding;
    }
    if (meta.resource === "operation") {
      const [, path, method] = meta.path ?? [];
      if (
        typeof path !== "string" ||
        typeof method !== "string" ||
        !isHttpMethod(method)
      ) {
        throw new Error("Operation symbol has no source operation location");
      }
      const id = paths[path]?.[method]?.operationId;
      if (id === undefined)
        throw new Error("Operation symbol has no source operation ID");
      if (
        meta.role !== undefined &&
        [
          "request-path",
          "request-query",
          "request-body",
          "request-headers",
          "responses",
        ].includes(meta.role)
      ) {
        if (!Object.hasOwn(operations, id))
          throw new Error(`Unknown operation binding ${id}`);
        if (Object.hasOwn(operations[id].schemas, meta.role))
          throw new Error(`Duplicate schema binding ${id}: ${meta.role}`);
        operations[id].schemas[meta.role] = binding;
      }
    }
  }

  for (const name of Object.keys(spec.components?.schemas ?? {})) {
    if (!Object.hasOwn(resources, name))
      throw new Error(`Generator dropped component schema ${name}`);
  }
  for (const [id, operation] of Object.entries(operations)) {
    const expected = new Set<string>();
    for (const parameter of operation.parameters) {
      const roles: Partial<Record<Parameter["in"], string>> = {
        path: "request-path",
        query: "request-query",
        header: "request-headers",
      };
      const role = roles[parameter.in];
      if (role) expected.add(role);
    }
    if (operation.bodyMediaTypes.length) expected.add("request-body");
    operation.hasResponseSchema = Object.values(operation.responses).some(
      (response) =>
        Object.values(
          resolveReference<ResponseObject>(response).content ?? {},
        ).some((media) => media.schema !== undefined),
    );
    if (operation.hasResponseSchema) expected.add("responses");
    for (const role of expected) {
      if (!Object.hasOwn(operation.schemas, role))
        throw new Error(`Generator dropped schema binding ${id}: ${role}`);
    }
  }
  await mkdir(generated, { recursive: true });
  const runtimeOperations: Record<string, OperationMetadata> =
    Object.create(null);
  for (const [id, operation] of Object.entries(operations)) {
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
  await writeFile(
    new URL("operations.ts", generated),
    [
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
    ].join("\n"),
  );

  const modules = new Map<string, string>();
  function renderSchemaType(
    binding: SchemaBinding | undefined,
    direction: "input" | "output",
  ): string {
    if (!binding) return "unknown";
    if (!modules.has(binding.file))
      modules.set(binding.file, `S${modules.size}`);
    return `z.${direction}<typeof ${modules.get(binding.file)}.${binding.name}>`;
  }
  const contracts = Object.entries(operations).map(([id, operation]) => {
    const path = operation.schemas["request-path"];
    const route = path
      ? `({ path: ${renderSchemaType(path, "input")}; resourceUrl?: never } | { resourceUrl: string; path?: never })`
      : "{ resourceUrl?: string; path?: never }";
    const fields = [];
    const query = operation.schemas["request-query"];
    if (query)
      fields.push(
        `query${operation.queryRequired ? "" : "?"}: ${renderSchemaType(query, "input")}`,
      );
    const body = operation.schemas["request-body"];
    if (body)
      fields.push(
        `body${operation.bodyRequired ? "" : "?"}: ${renderSchemaType(body, "input")}`,
      );
    return `  ${JSON.stringify(id)}: { input: ${route} & { ${fields.join("; ")} }; output: ${operation.hasResponseSchema ? renderSchemaType(operation.schemas.responses, "output") : "unknown"} };`;
  });
  const imports = [...modules].map(
    ([file, alias]) => `import type * as ${alias} from './${file}';`,
  );
  await writeFile(
    new URL("contracts.ts", generated),
    [
      "import type { z } from 'zod';",
      ...imports,
      "export type Operations = {",
      ...contracts,
      "};",
      "export type OperationId = keyof Operations;",
      'export type Input<K extends keyof Operations> = Operations[K]["input"];',
      'export type Output<K extends keyof Operations> = Operations[K]["output"];',
      "",
    ].join("\n"),
  );
  const generation: GenerationReport = {
    environment,
    sourceFile,
    servers: spec.servers,
    generator: "@hey-api/openapi-ts@0.99.0",
    typescript: "6.0.3",
    zod: "4.4.3",
    specSha256,
    converter,
    shared: "@hey-api/shared@0.5.0",
    operationCount: Object.keys(operations).length,
    alternativePathCount: alternativePaths.size,
    routeCoverage: spec["x-launchpad-route-coverage"],
    resourceSchemaCount: Object.keys(resources).length,
    sourceSchemaCount: Object.keys(spec.components?.schemas ?? {}).length,
    groupedModules: new Set(schemaBindings.map((binding) => binding.file)).size,
    checkedPathParameters,
    explicitOpenObjects,
    schemaBindings,
    components: resources,
    operations,
  };
  if (generation.resourceSchemaCount !== generation.sourceSchemaCount)
    throw new Error("Generator dropped component schemas");
  await writeFile(
    new URL("generation.json", generated),
    JSON.stringify(generation, null, 2) + "\n",
  );
  for (const directory of ["models", "operations"]) {
    const destination = new URL(`schemas/${directory}/`, generated);
    await rm(destination, { recursive: true, force: true });
    await cp(new URL(`schemas/${directory}/`, output), destination, {
      recursive: true,
    });
  }
  console.log(
    JSON.stringify(
      {
        environment,
        operationCount: generation.operationCount,
        sourceSchemaCount: generation.sourceSchemaCount,
        alternativePathCount: generation.alternativePathCount,
        schemaBindingCount: schemaBindings.length,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(output, { recursive: true, force: true });
}
