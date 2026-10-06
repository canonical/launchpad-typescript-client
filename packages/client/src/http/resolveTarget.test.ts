import { describe, expect, it } from "vitest";
import { invalidRequestTargets } from "../../testing/fixtures.js";
import resolveTarget from "./resolveTarget.js";

const base = new URL("https://example.test/api/devel/");

describe("resolveTarget", () => {
  it("keeps leading-slash paths under the full prefix and encodes ordinary spaces", () => {
    expect(resolveTarget(base, { path: "/a b" }).href).toBe(`${base}a%20b`);
    expect(base.href).toBe("https://example.test/api/devel/");
  });

  it("rejects ambiguous targets and URL syntax that parsing could reinterpret", () => {
    for (const target of invalidRequestTargets) {
      expect(() => resolveTarget(base, target)).toThrow(TypeError);
    }
  });
});
