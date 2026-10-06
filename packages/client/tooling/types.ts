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

export type Environment = (typeof ENVIRONMENTS)[number];
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type PathItem = OpenApi.V3_0_X["paths"][`/${string}`];
export type Reference = { $ref: string };
export type Parameter = Exclude<OpenApiParameterObject.V3_0_X, Reference>;
export type RequestBody = Exclude<OpenApiRequestBodyObject.V3_0_X, Reference>;
export type ResponseObject = Exclude<OpenApiResponseObject.V3_0_X, Reference>;
export type GeneratorSymbol = Parameters<
  NonNullable<NonNullable<Hooks["symbols"]>["getFilePath"]>
>[0];
export type SymbolMetadata = NonNullable<GeneratorSymbol["meta"]>;

export interface SchemaBinding {
  file: string;
  name: string;
}

export interface OperationMetadata {
  method: string;
  template: string;
  fixedQuery: [string, string][];
  bodyMediaTypes: string[];
  requiredPath: string[];
  queryRequired: boolean;
  bodyRequired: boolean;
  sourcePath: string;
}

export interface Operation extends OperationMetadata {
  sourceLocation: [string, string, HttpMethod];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, OpenApiResponseObject.V3_0_X>;
  schemas: Record<string, SchemaBinding>;
  hasResponseSchema?: boolean;
}

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
