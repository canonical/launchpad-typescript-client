import type {
  OpenApiDocument,
  Operation,
  OperationMetadata,
  Parameter,
  PathItem,
  PreparedGeneration,
  RequestBody,
} from "../types.ts";
import { isHttpMethod, isRecord, resolveReference } from "./sourceDocument.ts";
import buildOperationPaths from "./buildOperationPaths.ts";

/**
 * Reject a default anywhere in a path parameter schema, following references.
 * @note Tracks visited nodes in the supplied set to stop at reference cycles.
 */
function rejectDefaults(
  spec: OpenApiDocument,
  node: unknown,
  visited = new Set<object>(),
): void {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);
  if (Object.hasOwn(node, "default"))
    throw new Error("Path parameter schema contains a default");
  if (isRecord(node) && node.$ref)
    rejectDefaults(spec, resolveReference(spec, node), visited);
  for (const child of Object.values(node)) rejectDefaults(spec, child, visited);
}

/**
 * Make OpenAPI's default open-object behavior explicit for the Zod generator.
 * @returns The number of objects given an explicit additionalProperties value.
 * @note Mutates only the parsed generation input, never the source snapshot.
 */
function preserveOpenObjects(node: unknown): number {
  if (node === null || typeof node !== "object") return 0;
  let explicitOpenObjects = 0;
  if (
    isRecord(node) &&
    node.type === "object" &&
    node.additionalProperties === undefined
  ) {
    node.additionalProperties = true;
    explicitOpenObjects++;
  }
  for (const child of Object.values(node))
    explicitOpenObjects += preserveOpenObjects(child);
  return explicitOpenObjects;
}

/**
 * Include colliding routes under unique generator-only path keys.
 * @note Extends the parsed path map and records original URLs in alternativePaths
 * so generated transport metadata never uses the synthetic paths.
 */
function includeAlternatives(
  paths: OpenApiDocument["paths"],
  item: PathItem,
  alternativePaths: Map<string, string>,
): void {
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
    includeAlternatives(paths, alternative.item, alternativePaths);
  }
}

/**
 * Reject defaults in path parameter schemas.
 * @returns The number of path parameters checked.
 */
function validatePathParameters(
  spec: OpenApiDocument,
  parameters: Parameter[],
): number {
  let checkedPathParameters = 0;
  for (const parameter of parameters) {
    if (parameter.in !== "path") continue;
    rejectDefaults(spec, parameter.schema);
    for (const media of Object.values(parameter.content ?? {}))
      rejectDefaults(spec, media.schema);
    checkedPathParameters++;
  }
  return checkedPathParameters;
}

/** Split an upstream route into its path template and fixed query pairs. */
function parseRoute(
  sourcePath: string,
): Pick<OperationMetadata, "template" | "fixedQuery"> {
  const separator = sourcePath.indexOf("?");
  if (separator === -1) return { template: sourcePath, fixedQuery: [] };
  return {
    template: sourcePath.slice(0, separator),
    fixedQuery: [...new URLSearchParams(sourcePath.slice(separator + 1))],
  };
}

/**
 * Describe every source operation by its upstream ID, rejecting missing or
 * duplicate IDs and defaults in path parameter schemas.
 */
function collectOperations(
  spec: OpenApiDocument,
  alternativePaths: Map<string, string>,
): Pick<PreparedGeneration, "operations" | "groups" | "checkedPathParameters"> {
  const operations: Record<string, Operation> = Object.create(null);
  const groups = new Set<string>();
  let checkedPathParameters = 0;

  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (!isHttpMethod(method)) continue;
      const operation = item[method];
      if (operation === undefined) continue;
      const id = operation.operationId;
      const sourcePath = alternativePaths.get(path) ?? path;
      if (typeof id !== "string" || id.length === 0)
        throw new Error(`Missing operationId at ${method} ${sourcePath}`);
      if (Object.hasOwn(operations, id)) {
        const previous = operations[id];
        throw new Error(
          `Duplicate operationId ${id}: ${previous.sourceLocation[2]} ${previous.sourcePath} and ${method} ${sourcePath}`,
        );
      }
      for (const tag of operation.tags ?? []) groups.add(tag);

      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ].map((parameter) => resolveReference<Parameter>(spec, parameter));
      const requestBody =
        operation.requestBody &&
        resolveReference<RequestBody>(spec, operation.requestBody);
      checkedPathParameters += validatePathParameters(spec, parameters);

      operations[id] = {
        method: method.toUpperCase(),
        ...parseRoute(sourcePath),
        bodyMediaTypes: Object.keys(requestBody?.content ?? {}),
        requiredPath: parameters
          .filter((parameter) => parameter.in === "path")
          .map((parameter) => parameter.name),
        queryRequired: parameters.some(
          (parameter) => parameter.in === "query" && parameter.required,
        ),
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
  buildOperationPaths(operations);
  return { operations, groups, checkedPathParameters };
}

/**
 * Prepare routing metadata and generator input while retaining upstream IDs,
 * source URLs, and schema semantics. Reject duplicate or missing operation IDs
 * and defaults in path parameter schemas. Dotted IDs must form an unambiguous
 * method hierarchy that does not replace the client's built-in methods.
 * @note Mutates the parsed document to expose route alternatives and explicit
 * open objects. Callers must not serialize it back over the source snapshot.
 */
export default function prepareInput(
  spec: OpenApiDocument,
): PreparedGeneration {
  const explicitOpenObjects = preserveOpenObjects(spec);
  const alternativePaths = new Map<string, string>();
  for (const item of Object.values(spec.paths))
    includeAlternatives(spec.paths, item, alternativePaths);

  return {
    spec,
    ...collectOperations(spec, alternativePaths),
    alternativePathCount: alternativePaths.size,
    explicitOpenObjects,
  };
}
