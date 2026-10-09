import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createLaunchpadClient } from "../../index.js";

const baseUrl = "https://example.test/api/devel/";

describe("client boundaries", () => {
  it("fixed operation arguments cannot be changed through resource links", async () => {
    let requests = 0;
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        requests++;
        return Response.json(null);
      },
    });
    for (const query of [
      { path: "lp:example" },
      { path: "lp:example", "ws.op": "getByPath" },
    ]) {
      await assert.rejects(
        async () =>
          client.request("branches-getByPath", {
            resourceUrl: `${baseUrl}branches?ws.op=getByUrl`,
            query,
          }),
        TypeError,
      );
    }
    assert.equal(requests, 0);
  });

  it("absolute and relative URLs cannot escape the configured prefix", async () => {
    let requests = 0;
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        requests++;
        return Response.json(null);
      },
    });
    for (const request of [
      { resourceUrl: "https://outside.test/api/devel/bug/1" },
      { resourceUrl: "https://example.test/api/development/bug/1" },
      { resourceUrl: "https://user:secret@example.test/api/devel/bug/1" },
      { path: "../outside" },
      { path: "%2e%2e/outside" },
      { path: "//outside.test/api/devel/bug/1" },
    ])
      await assert.rejects(client.requestRaw(request), TypeError);
    assert.equal(requests, 0);
  });
});
