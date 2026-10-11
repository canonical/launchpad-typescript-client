import { describe, expect, it } from "vitest";
import { dictionaryOpenApi } from "../../testing/fixtures.ts";
import type { OpenApiDocument } from "../types.ts";
import prepareInput from "./prepareInput.ts";

function createSpec(ids: string[]): OpenApiDocument {
  return structuredClone({
    ...dictionaryOpenApi,
    paths: Object.fromEntries(
      ids.map((operationId, index) => [
        `/source${index}`,
        { get: { ...dictionaryOpenApi.paths["/dictionary"].get, operationId } },
      ]),
    ),
  }) as OpenApiDocument;
}

describe("prepareInput", () => {
  describe("nested operation paths", () => {
    it.each([
      ["account.get", "account.get.details"],
      ["account.get.details", "account.get"],
    ])(
      "rejects an operation/namespace conflict between %s and %s",
      (first, second) => {
        expect(() => prepareInput(createSpec([first, second]))).toThrow(
          new Error(
            `Conflicting operation paths ${first} (get /source0) and ${second} (get /source1)`,
          ),
        );
      },
    );

    it.each(["request", "requestRaw", "pages", "items"])(
      "rejects a subject that would replace client.%s",
      (subject) => {
        expect(() => prepareInput(createSpec([`${subject}.get`]))).toThrow(
          new RegExp(
            `Operation path ${subject}\\.get.*get /source0.*client\\.${subject}`,
          ),
        );
      },
    );

    it.each([
      "account.bad-name.get",
      "Account.get",
      "account..get",
      "account.get\n",
    ])("rejects malformed dotted ID %s without renaming it", (id) => {
      expect(() => prepareInput(createSpec([id]))).toThrow(
        /Invalid operation path .*get \/source0/s,
      );
    });
  });
});
