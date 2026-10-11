import { describe, expect, it } from "vitest";
import { invalidOperationInputs } from "../../testing/fixtures.js";
import type { OperationId } from "../generated/production/contracts.js";
import prepareOperation from "./prepareOperation.js";

const base = new URL("https://example.test/api/devel/");

describe("prepareOperation", () => {
  it("encodes each identifier as one segment without performing I/O", () => {
    const prepared = prepareOperation(base, "bug.get", {
      path: { id: "a/b + c" },
    });
    expect(prepared.url.href).toBe(`${base}bugs/a%2Fb%20%2B%20c`);
    expect(prepared.payload).toEqual({ method: "GET", body: undefined });
  });

  it("replaces supplied query fields while retaining untouched resource URL parameters", () => {
    const prepared = prepareOperation(base, "branches.getByPath", {
      resourceUrl: `${base}branches?ws.op=getByPath&path=old&keep=original`,
      query: { path: "lp:example", keep: undefined },
    });
    expect(prepared.url.searchParams.getAll("path")).toEqual(["lp:example"]);
    expect(prepared.url.searchParams.get("keep")).toBe("original");
    expect(prepared.url.searchParams.getAll("ws.op")).toEqual(["getByPath"]);
  });

  it("rejects nonfinite query scalars", () => {
    expect(() =>
      prepareOperation(base, "branches.getByPath", {
        query: { path: "lp:example", count: Infinity },
      }),
    ).toThrow(/finite/);
  });

  it("rejects malformed partitions and missing or unsafe path identifiers", () => {
    for (const input of invalidOperationInputs) {
      expect(() => prepareOperation(base, "bug.patch", input)).toThrow(
        TypeError,
      );
    }
    expect(() =>
      prepareOperation(base, "not-an-operation" as OperationId, {}),
    ).toThrow(/Unknown operation/);
    expect(() => prepareOperation(base, "branches.getByPath", {})).toThrow(
      /Missing required query partition/,
    );
    expect(() =>
      prepareOperation(base, "bug.get", { path: { id: "1" }, body: {} }),
    ).toThrow(/explicit encoding/);
  });
});
