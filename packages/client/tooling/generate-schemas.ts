import { createClient } from "@hey-api/openapi-ts";
import { childContext, type OpenApiResponseObject } from "@hey-api/shared";
import { fileURLToPath } from "node:url";
import { isHttpMethod, resolveReference } from "./prepare-generation.ts";
import type {
  GenerationReport,
  GeneratorSymbol,
  OpenApiDocument,
  Operation,
  Parameter,
  PreparedGeneration,
  Reference,
  SchemaBinding,
  SymbolMetadata,
} from "./types.ts";

const RESOURCE_SCHEMA_SUFFIX = /-(full|diff|page|json)$/;
const RESOURCE_GROUP_PATTERN = /^[a-zA-Z0-9_-]+$/;
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

/** A generator symbol retained until its final exported name is available. */
interface CollectedSymbol {
  symbol: GeneratorSymbol;
  meta: SymbolMetadata;
  file: string;
}

type SchemaBindings = Pick<GenerationReport, "components" | "schemaBindings">;
type ResponseObject = Exclude<OpenApiResponseObject.V3_0_X, Reference>;

function selectResourceGroup(
  meta: SymbolMetadata,
  groups: Set<string>,
): string {
  if (meta.resource === "operation" && meta.tags?.length) return meta.tags[0];
  if (meta.resource === "definition") {
    const name = meta.path?.[2];
    if (typeof name !== "string")
      throw new Error("Definition has no source schema name");
    const group = name.replace(RESOURCE_SCHEMA_SUFFIX, "");
    if (groups.has(group)) return group;
  }
  return "shared";
}

/**
 * Associate final generator names with their source schemas and operations.
 * @note Populates each operation's schema bindings in the prepared input.
 */
function bindSymbols(
  { spec, operations }: PreparedGeneration,
  symbols: Iterable<CollectedSymbol>,
): SchemaBindings {
  const components: Record<string, SchemaBinding> = Object.create(null);
  const schemaBindings: GenerationReport["schemaBindings"] = [];
  for (const { symbol, meta, file } of symbols) {
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
      if (Object.hasOwn(components, name))
        throw new Error(`Duplicate component binding ${name}`);
      components[name] = binding;
    }
    if (meta.resource !== "operation") continue;
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
      continue;
    if (!Object.hasOwn(operations, id))
      throw new Error(`Unknown operation binding ${id}`);
    if (Object.hasOwn(operations[id].schemas, meta.role))
      throw new Error(`Duplicate schema binding ${id}: ${meta.role}`);
    operations[id].schemas[meta.role] = binding;
  }
  return { components, schemaBindings };
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

/**
 * Reject generation that dropped a source component or operation schema.
 * @note Records whether each operation has a response schema, which determines
 * whether its output contract uses a generated type or remains unknown.
 */
function validateBindings(
  { spec, operations }: PreparedGeneration,
  components: Record<string, SchemaBinding>,
): void {
  for (const name of Object.keys(spec.components?.schemas ?? {})) {
    if (!Object.hasOwn(components, name))
      throw new Error(`Generator dropped component schema ${name}`);
  }
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
 * Generate grouped Zod modules and bind their final names to source locations.
 * Preserve open, closed, and typed-dictionary object behavior. Reject invalid
 * resource group names, duplicate bindings, or missing source schema bindings.
 *
 * @param prepared - Adapted snapshot and operation bookkeeping for one environment.
 * @param output - Temporary directory for the pinned generator's output.
 * @returns Component bindings and the full source-to-symbol inventory.
 * @note Writes generator output and updates prepared operations with bindings
 * and response-schema presence. Run once per process to isolate generator state.
 */
export default async function generateSchemas(
  prepared: PreparedGeneration,
  output: URL,
): Promise<SchemaBindings> {
  const symbols = new Map<number, CollectedSymbol>();
  await createClient({
    input: { ...prepared.spec },
    output: {
      path: fileURLToPath(output),
      entryFile: false,
      module: { extension: ".js" },
    },
    parser: {
      hooks: {
        symbols: {
          /**
           * Group Zod symbols by resource rather than a single global module.
           * @note Retains schema symbols until final names are assigned.
           */
          getFilePath(symbol) {
            const meta = symbol.meta;
            if (meta?.artifact !== "zod") return;
            const group = selectResourceGroup(meta, prepared.groups);
            if (!RESOURCE_GROUP_PATTERN.test(group))
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
          /**
           * Emit strict or loose objects, retaining typed additional properties.
           * @note Registers walked child schemas with the generator context.
           */
          object(ctx) {
            const additionalProperties = ctx.schema.additionalProperties;
            const isClosed =
              additionalProperties === false ||
              additionalProperties?.type === "never";
            let object = ctx
              .$(ctx.symbols.z)
              .attr(isClosed ? "strictObject" : "looseObject")
              .call(ctx.nodes.shape(ctx));
            const hasTypedAdditionalProperties =
              additionalProperties &&
              !isClosed &&
              additionalProperties.type !== "unknown";
            if (hasTypedAdditionalProperties) {
              const { _childResults: childResults } = ctx;
              const child = ctx.walk(
                additionalProperties,
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

  const bindings = bindSymbols(prepared, symbols.values());
  validateBindings(prepared, bindings.components);
  return bindings;
}
