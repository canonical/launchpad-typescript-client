import type { OperationMetadata, OperationPathNamespace } from "../types.ts";

const NAMING_PATH = /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)+$/;
const CLIENT_METHODS = new Set(["request", "requestRaw", "pages", "items"]);

/**
 * Build a nested lookup tree from upstream dotted IDs without renaming them.
 *
 * Legacy undotted IDs remain available only through request(). Reject malformed
 * dotted names, operation/namespace conflicts, and subjects that would replace
 * the client's request or pagination methods. Conflict diagnostics identify both
 * source definitions, including alternatives that share the same route.
 */
export default function buildOperationPaths(
  operations: Readonly<Record<string, OperationMetadata>>,
): OperationPathNamespace {
  const root: OperationPathNamespace = Object.create(null);
  const origins = new Map<string, string>();

  function describe(id: string): string {
    const operation = operations[id];
    return `${id} (${operation.method.toLowerCase()} ${operation.sourcePath})`;
  }

  for (const id of Object.keys(operations)) {
    if (!id.includes(".")) continue;
    if (!NAMING_PATH.test(id))
      throw new Error(`Invalid operation path ${describe(id)}`);
    const parts = id.split(".");
    if (CLIENT_METHODS.has(parts[0]))
      throw new Error(
        `Operation path ${describe(id)} would replace client.${parts[0]}`,
      );

    let namespace = root;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const prefix = parts.slice(0, index + 1).join(".");
      const existing = namespace[part];
      const isOperation = index === parts.length - 1;
      if (
        existing !== undefined &&
        (isOperation || typeof existing === "string")
      ) {
        throw new Error(
          `Conflicting operation paths ${describe(origins.get(prefix)!)} and ${describe(id)}`,
        );
      }
      if (!origins.has(prefix)) origins.set(prefix, id);
      if (isOperation) {
        namespace[part] = id;
      } else {
        if (existing === undefined) namespace[part] = Object.create(null);
        namespace = namespace[part] as OperationPathNamespace;
      }
    }
  }
  return root;
}
