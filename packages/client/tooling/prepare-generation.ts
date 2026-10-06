/**
 * Interpret the upstream snapshot for generation without correcting its schemas.
 * Preparation and binding checks share the same method and reference traversal
 * rules so both phases identify the same source operations.
 */
import { HTTP_METHODS } from "./constants.ts";
import type {
  HttpMethod,
  OpenApiDocument,
  Operation,
  Parameter,
  PathItem,
  PreparedGeneration,
  Reference,
  RequestBody,
} from "./types.ts";

/** Distinguish HTTP operation keys from other path-item metadata. */
export function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolve a local JSON Pointer using the type of its OpenAPI source location.
 * Reject external references, missing targets, and structural reference cycles;
 * do not infer replacement schemas.
 */
export function resolveReference<T extends object>(
  spec: OpenApiDocument,
  value: T | Reference,
): T {
  const seen = new Set<string>();
  while (true) {
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
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
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
    value = target as T | Reference;
  }
}

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
      if (
        typeof id !== "string" ||
        id.length === 0 ||
        Object.hasOwn(operations, id)
      )
        throw new Error(
          `Missing or duplicate operationId at ${method} ${path}`,
        );
      for (const tag of operation.tags ?? []) groups.add(tag);
      const parameters = [
        ...(item.parameters ?? []),
        ...(operation.parameters ?? []),
      ].map((parameter) => resolveReference<Parameter>(spec, parameter));
      const requestBody =
        operation.requestBody &&
        resolveReference<RequestBody>(spec, operation.requestBody);
      checkedPathParameters += validatePathParameters(spec, parameters);

      const sourcePath = alternativePaths.get(path) ?? path;
      const separator = sourcePath.indexOf("?");
      const template =
        separator === -1 ? sourcePath : sourcePath.slice(0, separator);
      const fixedQuery =
        separator === -1
          ? []
          : [...new URLSearchParams(sourcePath.slice(separator + 1))];
      operations[id] = {
        method: method.toUpperCase(),
        template,
        fixedQuery,
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
  return { operations, groups, checkedPathParameters };
}

/**
 * Prepare routing metadata and generator input while retaining upstream IDs,
 * source URLs, and schema semantics. Reject duplicate or missing operation IDs
 * and defaults in path parameter schemas.
 * @note Mutates the parsed document to expose route alternatives and explicit
 * open objects. Callers must not serialize it back over the source snapshot.
 */
export function prepareGeneration(spec: OpenApiDocument): PreparedGeneration {
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
