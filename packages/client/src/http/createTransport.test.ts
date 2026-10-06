import { describe, expect, it } from "vitest";
import { invalidClientOptions } from "../../testing/fixtures.js";
import type { LaunchpadClientOptions } from "../types.js";
import createTransport from "./createTransport.js";

describe("createTransport", () => {
  it("normalizes the complete API prefix and retains explicit cookie auth and Fetch", () => {
    const options: LaunchpadClientOptions = {
      baseUrl: "https://example.test/api/devel",
      auth: { type: "cookie" },
      fetch: async () => Response.json(null),
    };
    const transport = createTransport(options);
    expect(transport.base.href).toBe("https://example.test/api/devel/");
    expect(transport.auth).toBe(options.auth);
    expect(transport.fetcher).toBe(options.fetch);
    const defaults = createTransport({});
    expect(defaults.auth).toEqual({ type: "anonymous" });
    expect(defaults.fetcher).toBe(globalThis.fetch);
  });

  it("rejects unsafe prefixes and invalid JavaScript configuration before any request", () => {
    for (const options of invalidClientOptions) {
      expect(() => createTransport(options as LaunchpadClientOptions)).toThrow(
        TypeError,
      );
    }
  });
});
