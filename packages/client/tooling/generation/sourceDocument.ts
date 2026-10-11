/**
 * Rules for reading the upstream source document.
 *
 * Preparation and symbol binding both use these rules, so they identify the
 * same source operations and resolve references the same way.
 */
import { HTTP_METHODS } from "../constants.ts";
import type { HttpMethod, OpenApiDocument, Reference } from "../types.ts";

/** Distinguish HTTP operation keys from other path-item metadata. */
export function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}

/** Distinguish a JSON object from null, arrays, and primitive values. */
export function isRecord(value: unknown): value is Record<string, unknown> {
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
