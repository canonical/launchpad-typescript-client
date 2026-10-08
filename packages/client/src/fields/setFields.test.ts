import assert from "node:assert/strict";
import { describe, it } from "vitest";
import setFields from "./setFields.js";

describe("setFields", () => {
  it("replaces supplied keys while retaining untouched repeated parameters and undefined overrides", () => {
    const target = new URLSearchParams(
      "ws.op=old&ws.op=older&tag=one&tag=two&keep=first&keep=second",
    );

    setFields(target, {
      "ws.op": "getSomething",
      keep: undefined,
      missing: undefined,
    });

    assert.deepEqual(target.getAll("ws.op"), ["getSomething"]);
    assert.deepEqual(target.getAll("tag"), ["one", "two"]);
    assert.deepEqual(target.getAll("keep"), ["first", "second"]);
    assert.equal(target.has("missing"), false);
  });

  it("rejects scalar NaN, Infinity, and -Infinity", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      assert.throws(
        () => setFields(new URLSearchParams(), { count: value }),
        TypeError,
      );
    }
  });

  it("retains native JSON serialization of nonfinite numbers inside arrays", () => {
    const target = new URLSearchParams();

    setFields(target, { values: [NaN, Infinity, -Infinity, 2] });

    assert.equal(target.get("values"), "[null,null,null,2]");
  });
});
