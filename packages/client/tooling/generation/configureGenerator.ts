import type { Plugins, UserConfig } from "@hey-api/openapi-ts";
import { childContext } from "@hey-api/shared";
import { fileURLToPath } from "node:url";
import type {
  CollectedSymbol,
  GeneratorSymbol,
  PreparedGeneration,
  SymbolMetadata,
} from "../types.ts";

const RESOURCE_SCHEMA_SUFFIX = /-(full|diff|page|json)$/;
const RESOURCE_GROUP_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Configure grouped Zod output without changing upstream names or object semantics.
 * @note The routing hook retains live symbols in the supplied map, including
 * inferred types for conflict diagnostics. Binding happens after generation.
 */
export default function configureGenerator(
  prepared: PreparedGeneration,
  output: URL,
  symbols: Map<number, CollectedSymbol>,
): UserConfig {
  return {
    input: { ...prepared.spec },
    output: {
      path: fileURLToPath(output),
      entryFile: false,
      module: { extension: ".js" },
      nameConflictResolver: ({ baseName }) =>
        rejectSymbolConflict(baseName, symbols.values()),
    },
    parser: {
      hooks: {
        symbols: {
          getFilePath: (symbol) =>
            routeSymbol(symbol, prepared.groups, symbols),
        },
      },
    },
    plugins: [
      {
        name: "zod",
        compatibilityVersion: 4,
        dates: { offset: true },
        types: { infer: true },
        definitions: {
          types: { infer: { name: "{{name}}", case: "PascalCase" } },
        },
        requests: {
          types: { infer: { name: "{{name}}Data", case: "PascalCase" } },
          body: {
            types: { infer: { name: "{{name}}Body", case: "PascalCase" } },
          },
          headers: {
            types: { infer: { name: "{{name}}Headers", case: "PascalCase" } },
          },
          path: {
            types: { infer: { name: "{{name}}Path", case: "PascalCase" } },
          },
          query: {
            types: { infer: { name: "{{name}}Query", case: "PascalCase" } },
          },
        },
        responses: {
          types: { infer: { name: "{{name}}Response", case: "PascalCase" } },
        },
        $resolvers: { object: renderObject },
      },
    ],
  };
}

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
 * Route a Zod symbol to its resource module.
 * @note Retains the symbol in the supplied map until its final name is assigned.
 */
function routeSymbol(
  symbol: GeneratorSymbol,
  groups: Set<string>,
  symbols: Map<number, CollectedSymbol>,
): string | undefined {
  const meta = symbol.meta;
  if (meta?.artifact !== "zod") return;
  const group = selectResourceGroup(meta, groups);
  if (!RESOURCE_GROUP_PATTERN.test(group))
    throw new Error(`Invalid resource group ${group}`);
  const directory = meta.resource === "definition" ? "models" : "operations";
  const modulePath = `schemas/${directory}/${group}`;
  symbols.set(symbol.id, { symbol, meta, file: `${modulePath}.gen.js` });
  return modulePath;
}

function rejectSymbolConflict(
  baseName: string,
  symbols: Iterable<CollectedSymbol>,
): never {
  const sources = [...symbols]
    .filter(({ symbol }) => symbol.name === baseName)
    .map(({ meta, file }) => `${file}: ${JSON.stringify(meta.path)}`);
  throw new Error(
    `Conflicting generated symbol ${baseName}: ${sources.join(" and ")}`,
  );
}

/**
 * Emit strict or loose objects, retaining typed additional properties.
 * @note Registers walked child schemas with the generator context.
 */
const renderObject: Plugins.Zod.Resolvers["object"] = (ctx) => {
  const additionalProperties = ctx.schema.additionalProperties;
  const isClosed =
    additionalProperties === false || additionalProperties?.type === "never";
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
    object = object.attr("catchall").call(ctx.applyModifiers(child, {}).chain);
  }
  return object;
};
