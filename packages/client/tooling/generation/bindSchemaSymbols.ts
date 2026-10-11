import type { OpenApiResponseObject } from "@hey-api/shared";
import type {
  CollectedSymbol,
  GenerationReport,
  OpenApiDocument,
  Operation,
  Parameter,
  PreparedGeneration,
  Reference,
  SchemaBinding,
  SchemaBindings,
  SymbolMetadata,
} from "../types.ts";
import { isHttpMethod, resolveReference } from "./sourceDocument.ts";

const OPERATION_SCHEMA_ROLES = [
  "request-path",
  "request-query",
  "request-body",
  "request-headers",
  "responses",
];
const PARAMETER_SCHEMA_ROLES: Partial<Record<Parameter["in"], string>> = {
  path: "request-path",
  query: "request-query",
  header: "request-headers",
};

type ResponseObject = Exclude<OpenApiResponseObject.V3_0_X, Reference>;

/**
 * Bind a component schema by its upstream name.
 * @note Adds the binding to the component inventory, rejecting duplicates.
 */
function bindComponentSchema(
  components: Record<string, SchemaBinding>,
  meta: SymbolMetadata,
  binding: SchemaBinding,
): void {
  const name = meta.path?.[2];
  if (typeof name !== "string")
    throw new Error("Definition has no source schema name");
  if (Object.hasOwn(components, name))
    throw new Error(`Duplicate component binding ${name}`);
  components[name] = binding;
}

/**
 * Bind an operation schema by its source location and generator role.
 * @note Adds the binding to the prepared operation, rejecting duplicates.
 */
function bindOperationSchema(
  { spec, operations }: PreparedGeneration,
  meta: SymbolMetadata,
  binding: SchemaBinding,
): void {
  const [, path, method] = meta.path ?? [];
  if (
    typeof path !== "string" ||
    typeof method !== "string" ||
    !isHttpMethod(method)
  ) {
    throw new Error("Operation symbol has no source operation location");
  }
  const id = spec.paths[path]?.[method]?.operationId;
  if (id === undefined)
    throw new Error("Operation symbol has no source operation ID");
  if (meta.role === undefined || !OPERATION_SCHEMA_ROLES.includes(meta.role))
    return;
  if (!Object.hasOwn(operations, id))
    throw new Error(`Unknown operation binding ${id}`);
  if (Object.hasOwn(operations[id].schemas, meta.role))
    throw new Error(`Duplicate schema binding ${id}: ${meta.role}`);
  operations[id].schemas[meta.role] = binding;
}

function hasResponseSchema(
  spec: OpenApiDocument,
  operation: Operation,
): boolean {
  return Object.values(operation.responses).some((response) =>
    Object.values(
      resolveReference<ResponseObject>(spec, response).content ?? {},
    ).some((media) => media.schema !== undefined),
  );
}

/** Reject generation that dropped a source component schema. */
function validateComponentBindings(
  spec: OpenApiDocument,
  components: Record<string, SchemaBinding>,
): void {
  for (const name of Object.keys(spec.components?.schemas ?? {})) {
    if (!Object.hasOwn(components, name))
      throw new Error(`Generator dropped component schema ${name}`);
  }
}

/**
 * Reject generation that dropped a schema an operation's inputs or responses need.
 * @note Records whether each operation has a response schema, which determines
 * whether its output contract uses a generated type or remains unknown.
 */
function validateOperationBindings({
  spec,
  operations,
}: PreparedGeneration): void {
  for (const [id, operation] of Object.entries(operations)) {
    const expectedRoles = new Set<string>();
    for (const parameter of operation.parameters) {
      const role = PARAMETER_SCHEMA_ROLES[parameter.in];
      if (role) expectedRoles.add(role);
    }
    if (operation.bodyMediaTypes.length) expectedRoles.add("request-body");
    operation.hasResponseSchema = hasResponseSchema(spec, operation);
    if (operation.hasResponseSchema) expectedRoles.add("responses");
    for (const role of expectedRoles) {
      if (!Object.hasOwn(operation.schemas, role))
        throw new Error(`Generator dropped schema binding ${id}: ${role}`);
    }
  }
}

/**
 * Associate final generator names with their source schemas and operations,
 * then reject generation that dropped any source component or operation schema.
 * Bindings follow the prepared source document rather than guessing from names.
 *
 * @param prepared - Adapted snapshot and operation bookkeeping for one environment.
 * @param symbols - Zod symbols retained while the generator routed them to files.
 * @returns Component bindings and the full source-to-symbol inventory.
 * @note Populates each prepared operation's schema bindings and response-schema
 * presence.
 */
export default function bindSchemaSymbols(
  prepared: PreparedGeneration,
  symbols: Iterable<CollectedSymbol>,
): SchemaBindings {
  const components: Record<string, SchemaBinding> = Object.create(null);
  const schemaBindings: GenerationReport["schemaBindings"] = [];
  for (const { symbol, meta, file } of symbols) {
    // Inferred types are retained only for name-conflict diagnostics.
    if (meta.category !== "schema") continue;
    const binding = { file, name: symbol.finalName ?? symbol.name };
    if (typeof binding.name !== "string" || !binding.name)
      throw new Error("Schema symbol has no final name");
    schemaBindings.push({ ...binding, source: meta });

    // Parameter and response components can also produce definition symbols.
    // Only components/schemas contribute to resource-schema completeness.
    if (meta.resource === "definition" && meta.path?.[1] === "schemas")
      bindComponentSchema(components, meta, binding);
    if (meta.resource === "operation")
      bindOperationSchema(prepared, meta, binding);
  }

  validateComponentBindings(prepared.spec, components);
  validateOperationBindings(prepared);
  return { components, schemaBindings };
}
