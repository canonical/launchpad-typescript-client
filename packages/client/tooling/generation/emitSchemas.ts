import { createClient } from "@hey-api/openapi-ts";
import { toCase } from "@hey-api/shared";
import type {
  CollectedSymbol,
  PreparedGeneration,
  SchemaBindings,
} from "../types.ts";
import bindSchemaSymbols from "./bindSchemaSymbols.ts";
import configureGenerator from "./configureGenerator.ts";

/**
 * Spell an operation ID the way the pinned parser names its operation symbol.
 *
 * Drops leading characters that cannot start an identifier, replaces other
 * non-identifier characters and `$` or `+` with `-`, then converts the result
 * to camelCase. The parser's own helper for this is not exported.
 */
function formatOperationSymbolName(id: string): string {
  const sanitized = id
    .replace(/^[^\p{ID_Start}]+/u, "")
    .replace(/[^$\u200c\u200d\p{ID_Continue}]/gu, "-")
    .replace(/[$+]/g, "-");
  return toCase(sanitized, "camelCase");
}

/**
 * Reject operation IDs that would share a symbol name. The parser numbers such
 * names before any generator hook can see the collision.
 */
function validateOperationNames(
  operations: PreparedGeneration["operations"],
): void {
  const sources = new Map<string, string>();
  for (const [id, operation] of Object.entries(operations)) {
    const name = formatOperationSymbolName(id);
    const source = `${id} (${operation.method} ${operation.sourcePath})`;
    const previous = sources.get(name);
    if (previous !== undefined)
      throw new Error(
        `Conflicting generated symbol ${toCase(name, "PascalCase")}: ${previous} and ${source}`,
      );
    sources.set(name, source);
  }
}

/**
 * Generate grouped Zod modules and bind their final names to source locations.
 * Preserve open, closed, and typed-dictionary object behavior. Reject operation
 * or symbol name collisions, invalid resource group names, duplicate bindings,
 * or missing source schema bindings.
 *
 * @param prepared - Adapted snapshot and operation bookkeeping for one environment.
 * @param output - Temporary directory for the pinned generator's output.
 * @returns Component bindings and the full source-to-symbol inventory.
 * @note Writes generator output and updates prepared operations with bindings
 * and response-schema presence. Run once per process to isolate generator state.
 */
export default async function emitSchemas(
  prepared: PreparedGeneration,
  output: URL,
): Promise<SchemaBindings> {
  validateOperationNames(prepared.operations);
  // Keep live symbols: the generator assigns final names after routing files.
  const symbols = new Map<number, CollectedSymbol>();
  await createClient(configureGenerator(prepared, output, symbols));
  return bindSchemaSymbols(prepared, symbols.values());
}
