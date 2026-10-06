// Intentionally untyped JavaScript inputs exercise runtime checks, not TS errors.
export const invalidClientOptions: readonly unknown[] = [
  { baseUrl: null },
  { baseUrl: "ftp://example.test/devel/" },
  { baseUrl: "https://user:secret@example.test/devel/" },
  { baseUrl: "https://example.test/devel/?" },
  { baseUrl: "https://example.test/devel/#" },
  { auth: null },
  { auth: "cookie" },
  { auth: { type: "unknown" } },
  { auth: { type: "oauth1", signer: null } },
  { fetch: null },
];

export const invalidRequestTargets = [
  {},
  { path: "one", resourceUrl: "https://example.test/api/devel/two" },
  { resourceUrl: 42 },
  { resourceUrl: "ftp://example.test/api/devel/" },
  { resourceUrl: "https://example.test/api/devel/a b" },
  { resourceUrl: "https://example.test/api/devel/%invalid" },
  { path: 42 },
  { path: "https://example.test/api/devel/" },
  { path: " leading-space" },
  { path: "control\u0001" },
  { path: "back\\\\slash" },
  { path: "delete\u007f" },
  { path: "bad%escape" },
  { path: "fragment#" },
];

export const zodFreeClientConsumer = `
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "zod" || specifier.startsWith("zod/")) throw new Error("Transport imported Zod");
    return nextResolve(specifier, context);
  },
});
const { createLaunchpadClient } = await import("@canonical/launchpad-typescript-client");
const client = createLaunchpadClient({ fetch: async () => Response.json({ ok: true }) });
assert.deepEqual((await client.requestRaw({ path: "launchpad" })).data, { ok: true });
`;

export const dictionaryOpenApi = {
  openapi: "3.0.3",
  info: { title: "Dictionary boundaries", version: "1" },
  servers: [{ url: "https://api.launchpad.net/devel" }],
  paths: {
    "/dictionary": {
      get: {
        operationId: "dictionary-get",
        tags: ["dictionary"],
        responses: {
          200: {
            description: "Dictionary",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dictionary" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Dictionary: {
        type: "object",
        additionalProperties: { type: "integer" },
      },
      Mixed: {
        type: "object",
        properties: { label: { type: "string" } },
        additionalProperties: { type: "integer" },
      },
      Closed: {
        type: "object",
        properties: { label: { type: "string" } },
        additionalProperties: false,
      },
      Open: {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: { label: { type: "string" } },
          },
        },
      },
    },
  },
};

export const referencedParameterOpenApi = {
  ...dictionaryOpenApi,
  paths: {
    "/dictionary/{key}": {
      get: {
        ...dictionaryOpenApi.paths["/dictionary"].get,
        parameters: [{ $ref: "#/components/parameters/Key" }],
      },
    },
  },
  components: {
    ...dictionaryOpenApi.components,
    parameters: {
      Key: {
        in: "path",
        name: "key",
        required: true,
        schema: { type: "string" },
      },
    },
  },
};

export const qastagingDictionaryOpenApi = {
  ...dictionaryOpenApi,
  servers: [{ url: "https://api.qastaging.launchpad.net/devel" }],
  paths: {
    "/qa-dictionary": {
      get: {
        ...dictionaryOpenApi.paths["/dictionary"].get,
        operationId: "dictionary-get-qa",
      },
    },
  },
  components: {
    schemas: {
      ...dictionaryOpenApi.components.schemas,
      Dictionary: {
        type: "object",
        additionalProperties: { type: "string" },
      },
    },
  },
};

export const environmentContractConsumer = `
import type { Input, Output } from "@canonical/launchpad-typescript-client/contracts/production";
import type { Output as QaOutput } from "@canonical/launchpad-typescript-client/contracts/qastaging";
const production: Output<"dictionary-get"> = { answer: 42 };
const qastaging: QaOutput<"dictionary-get-qa"> = { answer: "42" };
// @ts-expect-error Production and qastaging retain different value types.
const wrongProduction: Output<"dictionary-get"> = { answer: "42" };
// @ts-expect-error Production operations are not qastaging operations.
type WrongOperation = QaOutput<"dictionary-get">;
const input: Input<"dictionary-get"> = {};
void [production, qastaging, wrongProduction, input];
`;

export const fakeConverterCli = `
import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const environment = args.includes("--environment") ? args[args.indexOf("--environment") + 1] : "production";
if (environment === "production" && args[args.indexOf("--instance") + 1] !== "launchpad.net") throw new Error("Production instance must be explicit");
if (environment !== "production" && environment !== "qastaging") throw new Error("Unexpected environment");
const source = await readFile(new URL("../../schema/" + environment + "/openapi.json", import.meta.url), "utf8");
await writeFile(args[args.indexOf("--output") + 1], source);
`;

export const environmentSchemaConsumer = `
import assert from "node:assert/strict";
import { zDictionary as legacy } from "@canonical/launchpad-typescript-client/schemas/models/shared";
import { zDictionary as production } from "@canonical/launchpad-typescript-client/schemas/production/models/shared";
import { zDictionary as qastaging } from "@canonical/launchpad-typescript-client/schemas/qastaging/models/shared";
assert.equal(legacy, production);
assert.equal(production.safeParse({ answer: 42 }).success, true);
assert.equal(production.safeParse({ answer: "42" }).success, false);
assert.equal(qastaging.safeParse({ answer: "42" }).success, true);
assert.equal(qastaging.safeParse({ answer: 42 }).success, false);
`;
