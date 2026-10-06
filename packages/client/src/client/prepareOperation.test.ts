import { describe, expect, it } from "vitest";
import { invalidOperationInputs } from "../../testing/fixtures.js";
import type { OperationId } from "../generated/production/contracts.js";
import prepareOperation from "./prepareOperation.js";

const base = new URL("https://example.test/api/devel/");

describe("prepareOperation", () => {
  it("encodes each identifier as one segment without performing I/O", () => {
    const prepared = prepareOperation(base, "bug-get", {
      path: { id: "a/b + c" },
    });
    expect(prepared.url.href).toBe(`${base}bugs/a%2Fb%20%2B%20c`);
    expect(prepared.payload).toEqual({ method: "GET", body: undefined });
  });

  it("rejects malformed partitions and missing or unsafe path identifiers", () => {
    for (const input of invalidOperationInputs) {
      expect(() => prepareOperation(base, "bug-patch", input)).toThrow(
        TypeError,
      );
    }
    expect(() =>
      prepareOperation(base, "not-an-operation" as OperationId, {}),
    ).toThrow(/Unknown operation/);
    expect(() => prepareOperation(base, "branches-getByPath", {})).toThrow(
      /Missing required query partition/,
    );
    expect(() =>
      prepareOperation(base, "bug-get", { path: { id: "1" }, body: {} }),
    ).toThrow(/explicit encoding/);
  });
});
