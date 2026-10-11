/**
 * Adapter bookkeeping derived from the generator's OpenAPI and symbol contracts.
 * These types describe generation state, not corrections to upstream API fields.
 */
import type {
  Hooks,
  OpenApi,
  OpenApiParameterObject,
  OpenApiRequestBodyObject,
  OpenApiResponseObject,
} from "@hey-api/shared";
import type { ENVIRONMENTS, HTTP_METHODS } from "./constants.ts";

/** A Launchpad environment with its own snapshot contract. */
export type Environment = (typeof ENVIRONMENTS)[number];

/** An OpenAPI path-item key that describes an HTTP operation. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Upstream operations and shared parameters at a single path. */
export type PathItem = OpenApi.V3_0_X["paths"][`/${string}`];

/** Parsed snapshot whose path map can also hold generator-only route keys. */
export type OpenApiDocument = OpenApi.V3_0_X & {
  paths: Record<string, PathItem>;
};

/** A reference resolved against the snapshot, never fetched externally. */
export type Reference = { $ref: string };

/** An upstream parameter after resolving any structural reference. */
export type Parameter = Exclude<OpenApiParameterObject.V3_0_X, Reference>;

/** An upstream request body after resolving any structural reference. */
export type RequestBody = Exclude<OpenApiRequestBodyObject.V3_0_X, Reference>;

/** A symbol supplied to the pinned generator's file-routing hook. */
export type GeneratorSymbol = Parameters<
  NonNullable<NonNullable<Hooks["symbols"]>["getFilePath"]>
>[0];

/** Generator-provided source location, resource category, and schema role. */
export type SymbolMetadata = NonNullable<GeneratorSymbol["meta"]>;

/** A generator symbol retained until its final exported name is available. */
export interface CollectedSymbol {
  symbol: GeneratorSymbol;
  meta: SymbolMetadata;
  file: string;
}

/** Component bindings and the full source-to-symbol inventory. */
export type SchemaBindings = Pick<
  GenerationReport,
  "components" | "schemaBindings"
>;

/** Final exported schema name and module path relative to the environment. */
export interface SchemaBinding {
  file: string;
  name: string;
}

/** Routing and wire-encoding data emitted without importing validators. */
export interface OperationMetadata {
  method: string;
  /** Original route with its fixed query string removed. */
  template: string;
  /** Ordered query pairs embedded in the upstream route, including duplicates. */
  fixedQuery: [string, string][];
  bodyMediaTypes: string[];
  requiredPath: string[];
  queryRequired: boolean;
  bodyRequired: boolean;
  /** Upstream route, never the synthetic key used to expose an alternative. */
  sourcePath: string;
}

/** A generated naming hierarchy whose leaves retain upstream operation IDs. */
export interface OperationPathNamespace {
  [component: string]: string | OperationPathNamespace;
}

/** Source operation bookkeeping enriched with bindings after schema generation. */
export interface Operation extends OperationMetadata {
  /** Location in the adapted document; alternatives use generator-only keys. */
  sourceLocation: [string, string, HttpMethod];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, OpenApiResponseObject.V3_0_X>;
  schemas: Record<string, SchemaBinding>;
  hasResponseSchema?: boolean;
}

/**
 * In-memory input shared by preparation and schema generation. The document has
 * explicit open-object behavior and synthetic keys for route alternatives;
 * operation bindings are populated only after the generator assigns final names.
 */
export interface PreparedGeneration {
  spec: OpenApiDocument;
  operations: Record<string, Operation>;
  groups: Set<string>;
  alternativePathCount: number;
  checkedPathParameters: number;
  explicitOpenObjects: number;
}

/** Provenance, adaptation counts, and bindings saved in generation.json. */
export interface GenerationReport {
  environment: Environment;
  sourceFile: string;
  servers: OpenApi.V3_0_X["servers"];
  generator: string;
  typescript: string;
  zod: string;
  shared: string;
  specSha256: string;
  converter: string;
  operationCount: number;
  alternativePathCount: number;
  routeCoverage: unknown;
  resourceSchemaCount: number;
  sourceSchemaCount: number;
  groupedModules: number;
  checkedPathParameters: number;
  explicitOpenObjects: number;
  schemaBindings: (SchemaBinding & { source: SymbolMetadata })[];
  components: Record<string, SchemaBinding>;
  operations: Record<string, Operation>;
}
