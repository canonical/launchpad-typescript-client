import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createLaunchpadClient } from "../../index.js";

describe("field validation", () => {
  for (const [encoding, request] of [
    ["query", { path: "resource", query: { count: Infinity } }],
    [
      "form",
      {
        path: "resource",
        method: "POST",
        body: { encoding: "form", value: { count: NaN } },
      },
    ],
  ] as const) {
    it(`rejects nonfinite ${encoding} scalars before signing or Fetch`, async () => {
      let signatures = 0;
      let requests = 0;
      const client = createLaunchpadClient({
        baseUrl: "https://example.test/api/devel/",
        auth: {
          type: "oauth1",
          signer: () => {
            signatures++;
            return "OAuth test-signature";
          },
        },
        fetch: async () => {
          requests++;
          return Response.json(null);
        },
      });

      await assert.rejects(client.requestRaw(request), TypeError);

      assert.equal(signatures, 0);
      assert.equal(requests, 0);
    });
  }
});
