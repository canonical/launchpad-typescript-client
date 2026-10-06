import { operations } from "../generated/production/operations.js";
import type { OperationId } from "../generated/production/contracts.js";
import assertRecord from "../validation/assertRecord.js";
import appendFields from "../fields/appendFields.js";
import resolveTarget from "../http/resolveTarget.js";
import type { RequestPayload } from "../types.js";

const PATH_PARAMETER = /\{([^}]+)\}/g;

function encodePathIdentifier(
  path: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = path?.[key];
  if (value === undefined || value === null || value === "") {
    throw new TypeError(`Missing path parameter ${key}`);
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new TypeError(`Path parameter ${key} must be a primitive`);
  }
  const segment = String(value);
  if (segment === "." || segment === "..") {
    throw new TypeError(`Path parameter ${key} cannot be a dot segment`);
  }
  return encodeURIComponent(segment);
}

function encodeOperationBody(
  mediaTypes: readonly string[],
  value: unknown,
): RequestPayload["body"] {
  if (value === undefined) return undefined;
  if (mediaTypes.length !== 1) {
    throw new TypeError(
      "Ambiguous request media type; use requestRaw with explicit encoding",
    );
  }
  switch (mediaTypes[0]) {
    case "application/json":
      return { encoding: "json", value };
    case "application/x-www-form-urlencoded":
      return { encoding: "form", value };
    default:
      throw new TypeError(
        `Unsupported generated body media type ${mediaTypes[0]}; use requestRaw`,
      );
  }
}

/**
 * Prepare a generated operation for transport without performing I/O.
 *
 * Resolves path identifiers or a confined resource URL, appends query fields, and
 * selects body encoding from generated metadata. Fixed operation query values
 * cannot be overridden, including through resource URLs.
 *
 * @returns A confined URL and the method/body payload to serialize.
 * @throws TypeError for invalid partitions, identifiers, query conflicts, or
 * ambiguous/unsupported body media types. No response validation is performed.
 */
export default function prepareOperation(
  base: URL,
  operationId: OperationId,
  input: unknown,
): { url: URL; payload: RequestPayload } {
  const operation = Object.hasOwn(operations, operationId)
    ? operations[operationId]
    : undefined;
  if (operation === undefined)
    throw new TypeError(`Unknown operation ${operationId}`);
  assertRecord(input, "Operation input");
  const partitions = input;
  if (partitions.path !== undefined && partitions.resourceUrl !== undefined) {
    throw new TypeError("Conflicting path and resourceUrl inputs");
  }
  if (operation.queryRequired && partitions.query === undefined) {
    throw new TypeError("Missing required query partition");
  }
  if (operation.bodyRequired && partitions.body === undefined) {
    throw new TypeError("Missing required body partition");
  }
  let url: URL;
  if (partitions.resourceUrl !== undefined) {
    url = resolveTarget(base, {
      resourceUrl: partitions.resourceUrl,
    });
  } else {
    const path = partitions.path;
    if (path !== undefined) assertRecord(path, "Path parameters");
    const route = operation.template.replace(
      PATH_PARAMETER,
      (_placeholder, key: string) => encodePathIdentifier(path, key),
    );
    url = resolveTarget(base, { path: route });
  }
  appendFields(url.searchParams, partitions.query);
  for (const [key, value] of operation.fixedQuery) {
    if (url.searchParams.getAll(key).some((existing) => existing !== value)) {
      throw new TypeError(`Cannot override operation parameter ${key}`);
    }
    url.searchParams.set(key, value);
  }
  return {
    url,
    payload: {
      method: operation.method,
      body: encodeOperationBody(operation.bodyMediaTypes, partitions.body),
    },
  };
}
