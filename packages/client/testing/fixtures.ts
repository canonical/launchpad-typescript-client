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

export const fakeConverterCli = `
import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const environment = args.includes("--environment") ? args[args.indexOf("--environment") + 1] : "production";
if (environment === "production" && args[args.indexOf("--instance") + 1] !== "launchpad.net") throw new Error("Production instance must be explicit");
if (environment !== "production" && environment !== "qastaging") throw new Error("Unexpected environment");
const source = await readFile(new URL("../../schema/" + environment + "/openapi.json", import.meta.url), "utf8");
await writeFile(args[args.indexOf("--output") + 1], source);
`;
