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

export const invalidOperationInputs = [
  null,
  [],
  { path: null, body: {} },
  {
    path: { id: "1" },
    resourceUrl: "https://example.test/api/devel/bugs/1",
    body: {},
  },
  { path: {}, body: {} },
  { path: { id: null }, body: {} },
  { path: { id: "" }, body: {} },
  { path: { id: [] }, body: {} },
  { path: { id: "." }, body: {} },
  { path: { id: ".." }, body: {} },
  { path: { id: "1" } },
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
const { createLaunchpadClient } = await import("@canonical/launchpad-client");
const client = createLaunchpadClient({ fetch: async () => Response.json({ ok: true }) });
assert.deepEqual((await client.requestRaw({ path: "launchpad" })).data, { ok: true });
const pages = client.pages({ start: 0, entries: ["first"] });
assert.deepEqual((await pages.next()).value.entries, ["first"]);
assert.equal((await pages.next()).done, true);
`;

export const dictionaryOpenApi = {
  openapi: "3.0.3",
  info: { title: "Dictionary boundaries", version: "1" },
  servers: [{ url: "https://api.launchpad.net/devel" }],
  paths: {
    "/dictionary": {
      get: {
        operationId: "dictionary.get",
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

export const moduleScopedOperationsOpenApi = {
  ...dictionaryOpenApi,
  paths: Object.fromEntries(
    [
      ["dictionaryEntry.get", "dictionary_entry"],
      ["dictionary.entry.get", "dictionary"],
    ].map(([operationId, tag]) => [
      `/${tag}/{key}`,
      {
        get: {
          ...dictionaryOpenApi.paths["/dictionary"].get,
          operationId,
          tags: [tag],
          parameters: [
            {
              name: "key",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
        },
      },
    ]),
  ),
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

export const nestedOperationOpenApi = {
  ...dictionaryOpenApi,
  paths: {
    ...dictionaryOpenApi.paths,
    "/dictionary/{key}?ws.op=get_by_URL": {
      get: {
        ...referencedParameterOpenApi.paths["/dictionary/{key}"].get,
        operationId: "dictionary.sourcePackage.self.getByUrl",
      },
    },
    "/dictionaries?ws.op=new_dictionary": {
      post: {
        operationId: "dictionaries.newDictionary",
        tags: ["dictionaries"],
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["display_name"],
                properties: { display_name: { type: "string" } },
              },
            },
          },
        },
        responses: { 201: { description: "Created" } },
      },
    },
    "/legacy": {
      get: {
        ...dictionaryOpenApi.paths["/dictionary"].get,
        operationId: "legacy-get",
      },
    },
    "/prototype-names": {
      get: {
        ...dictionaryOpenApi.paths["/dictionary"].get,
        operationId: "constructor.toString.get",
      },
    },
  },
  components: referencedParameterOpenApi.components,
};

export const nestedRequestConsumer = `
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "zod" || specifier.startsWith("zod/")) throw new Error("Transport imported Zod");
    return nextResolve(specifier, context);
  },
});
const { createLaunchpadClient, LaunchpadApiError, LaunchpadDecodeError } = await import("@canonical/launchpad-client");
const fetched = [];
const signed = [];
let response;
const client = createLaunchpadClient({
  baseUrl: "https://example.test/api/devel/",
  auth: { type: "oauth1", signer(request) { signed.push(request); return "OAuth test"; } },
  fetch: async (request) => {
    fetched.push({ request, body: await request.text() });
    response = request.headers.get("X-Fail") ? Response.json({ error: "no" }, { status: 400 }) : Response.json({ answer: 42 });
    return response;
  },
});
const input = { path: { key: "name + value" } };
const plain = await client.dictionary.sourcePackage.self.getByUrl(input);
assert.deepEqual(plain.data, { answer: 42 });
assert.equal(plain.response, response);
await client.request("dictionary.sourcePackage.self.getByUrl", input);
assert.equal(fetched[0].request.url, fetched[1].request.url);
assert.equal(fetched[0].request.url, "https://example.test/api/devel/dictionary/name%20%2B%20value?ws.op=get_by_URL");
const get = client.dictionary.sourcePackage.self.getByUrl;
const controller = new AbortController();
const signal = controller.signal;
const decoding = { factor: 2, decode(value) { return value.answer * this.factor; }, signal, headers: { "X-Option": "yes" } };
assert.equal((await get({ resourceUrl: "https://example.test/api/devel/dictionary/key" }, decoding)).data, 84);
assert.equal(fetched[2].request.headers.get("X-Option"), "yes");
controller.abort();
assert.equal(fetched[2].request.signal.aborted, true);
await client.dictionaries.newDictionary({ body: { display_name: "A + B" } });
assert.equal(fetched[3].request.method, "POST");
assert.equal(new URL(fetched[3].request.url).searchParams.get("ws.op"), "new_dictionary");
assert.equal(fetched[3].body, "display_name=A+%2B+B");
assert.equal(fetched[3].request.headers.get("Content-Type"), "application/x-www-form-urlencoded");
for (const [index, { request }] of fetched.entries()) {
  assert.equal(request.url, signed[index].url);
  assert.equal(request.headers.get("Authorization"), "OAuth test");
}
assert.deepEqual((await client.dictionary.get({})).data, { answer: 42 });
assert.deepEqual((await client.constructor.toString.get({})).data, { answer: 42 });
assert.equal(client.legacy, undefined);
await client.request("legacy-get", {});
const cause = new Error("decoder rejected");
await assert.rejects(get(input, { decode() { throw cause; } }), error => {
  assert.ok(error instanceof LaunchpadDecodeError);
  assert.equal(error.cause, cause);
  assert.equal(error.response, response);
  return true;
});
await assert.rejects(get(input, { headers: { "X-Fail": "yes" } }), LaunchpadApiError);
const before = fetched.length;
assert.throws(() => get({ resourceUrl: "https://elsewhere.test/api/devel/key" }), TypeError);
assert.throws(() => get({ ...input, query: { "ws.op": "other" } }), TypeError);
assert.equal(fetched.length, before);
`;

export const nestedRequestTypeConsumer = `
import { createLaunchpadClient, type LaunchpadClient, type LaunchpadResponse } from "@canonical/launchpad-client";
import type { Input, Output } from "@canonical/launchpad-client/contracts";
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Data<R extends Promise<LaunchpadResponse<unknown>>> = Awaited<R>["data"];
declare function expectType<T extends true>(): T;
const client: LaunchpadClient = createLaunchpadClient();
const input: Input<"dictionary.sourcePackage.self.getByUrl"> = { path: { key: "name" } };
const plain = client.dictionary.sourcePackage.self.getByUrl(input);
const withOptions = client.dictionary.sourcePackage.self.getByUrl(input, { headers: {} });
const decoded = client.dictionary.sourcePackage.self.getByUrl(input, { decode: String });
const absolute = client.dictionary.sourcePackage.self.getByUrl({ resourceUrl: "https://example.test/devel/dictionary/name" });
expectType<Equal<Data<typeof plain>, Output<"dictionary.sourcePackage.self.getByUrl">>>();
expectType<Equal<Data<typeof withOptions>, Output<"dictionary.sourcePackage.self.getByUrl">>>();
expectType<Equal<Data<typeof decoded>, string>>();
expectType<Equal<Data<typeof absolute>, Output<"dictionary.sourcePackage.self.getByUrl">>>();
const noNamespace = client.dictionary.get({});
expectType<Equal<Data<typeof noNamespace>, Output<"dictionary.get">>>();
const unknown = client.dictionaries.newDictionary({ body: { display_name: "Name" } });
expectType<Equal<Data<typeof unknown>, unknown>>();
// @ts-expect-error Namespaces are not callable operations.
client.dictionary.sourcePackage({});
// @ts-expect-error No guessed singular alias.
client.dictionary.newDictionary({ body: { display_name: "Name" } });
// @ts-expect-error No guessed namespace for legacy IDs.
client.legacy.get({});
// @ts-expect-error Required generated inputs are preserved.
client.dictionary.sourcePackage.self.getByUrl();
// @ts-expect-error Path identifiers keep their generated types.
client.dictionary.sourcePackage.self.getByUrl({ path: { key: 1 } });
// @ts-expect-error Path and resource URL are mutually exclusive.
client.dictionary.sourcePackage.self.getByUrl({ ...input, resourceUrl: "https://example.test/devel/key" });
// @ts-expect-error Required form body is preserved.
client.dictionaries.newDictionary({});
// @ts-expect-error Arbitrary response types still require a decoder.
client.dictionary.get<string>({});
`;

export const qastagingDictionaryOpenApi = {
  ...dictionaryOpenApi,
  servers: [{ url: "https://api.qastaging.launchpad.net/devel" }],
  paths: {
    "/qa-dictionary": {
      get: {
        ...dictionaryOpenApi.paths["/dictionary"].get,
        operationId: "dictionary.qa.get",
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
import { createLaunchpadClient, type Output as RootOutput } from "@canonical/launchpad-client";
import type { Input, Output } from "@canonical/launchpad-client/contracts";
import type { Output as ProductionOutput } from "@canonical/launchpad-client/contracts/production";
import type { Output as QaOutput } from "@canonical/launchpad-client/contracts/qastaging";
import type { Dictionary } from "@canonical/launchpad-client/schemas/models/shared";
import type { Dictionary as ProductionDictionary } from "@canonical/launchpad-client/schemas/production/models/shared";
import type { Dictionary as QaDictionary } from "@canonical/launchpad-client/schemas/qastaging/models/shared";
import type { DictionaryQaGetResponse } from "@canonical/launchpad-client/schemas/operations/dictionary";
import type { DictionaryGetResponse } from "@canonical/launchpad-client/schemas/production/operations/dictionary";
const production: ProductionOutput<"dictionary.get"> = { answer: 42 };
const qastaging: QaOutput<"dictionary.qa.get"> = { answer: "42" };
const defaultOutput: Output<"dictionary.qa.get"> = qastaging;
const rootOutput: RootOutput<"dictionary.qa.get"> = defaultOutput;
const input: Input<"dictionary.qa.get"> = {};
const client = createLaunchpadClient();
const nested = client.dictionary.qa.get(input);
const requested = client.request("dictionary.qa.get", input);
const nestedOutput: Promise<{ data: QaOutput<"dictionary.qa.get"> }> = nested;
const requestedOutput: Promise<{ data: QaOutput<"dictionary.qa.get"> }> = requested;
// @ts-expect-error The root client exposes qastaging, not production-only methods.
client.dictionary.get({});
// @ts-expect-error Production operations are not default operations.
type WrongOperation = Output<"dictionary.get">;
// @ts-expect-error Production and qastaging retain different value types.
const wrongDefault: Output<"dictionary.qa.get"> = production;
const model: Dictionary = defaultOutput;
const qaModel: QaDictionary = model;
const productionModel: ProductionDictionary = production;
const response: DictionaryQaGetResponse = qaModel;
const productionResponse: DictionaryGetResponse = productionModel;
// @ts-expect-error Model aliases must retain their inferred value types.
const wrongModel: Dictionary = productionModel;
void [rootOutput, nestedOutput, requestedOutput, wrongDefault, response, productionResponse, wrongModel];
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
import { createLaunchpadClient } from "@canonical/launchpad-client";
import { zDictionary as defaultSchema } from "@canonical/launchpad-client/schemas/models/shared";
import { zDictionary as production } from "@canonical/launchpad-client/schemas/production/models/shared";
import { zDictionary as qastaging } from "@canonical/launchpad-client/schemas/qastaging/models/shared";
import { zDictionaryQaGetResponse as defaultResponse } from "@canonical/launchpad-client/schemas/operations/dictionary";
import { zDictionaryQaGetResponse as qaResponse } from "@canonical/launchpad-client/schemas/qastaging/operations/dictionary";
assert.equal(defaultSchema, qastaging);
assert.equal(defaultResponse, qaResponse);
assert.equal(production.safeParse({ answer: 42 }).success, true);
assert.equal(production.safeParse({ answer: "42" }).success, false);
assert.equal(qastaging.safeParse({ answer: "42" }).success, true);
assert.equal(qastaging.safeParse({ answer: 42 }).success, false);
const urls = [];
const client = createLaunchpadClient({ fetch: async request => {
  urls.push(request.url);
  return Response.json({ answer: "42" });
}});
assert.deepEqual((await client.dictionary.qa.get({})).data, { answer: "42" });
assert.deepEqual((await client.request("dictionary.qa.get", {})).data, { answer: "42" });
assert.deepEqual(urls, Array(2).fill("https://api.launchpad.net/devel/qa-dictionary"));
assert.equal(client.dictionary.get, undefined);
`;
