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
          client.request("branches.getByPath", {
            resourceUrl: `${baseUrl}branches?ws.op=getByUrl`,
            query,
          }),
        TypeError,
      );
    }
    assert.equal(requests, 0);
  });

  it("pagination decodes the first and subsequent page entries", async () => {
    let requests = 0;
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        requests++;
        return Response.json({ start: 1, entries: ["2"] });
      },
    });
    const first = {
      start: 0,
      entries: ["1"],
      next_collection_link: `${baseUrl}page?ws.start=1`,
    };
    const seen: unknown[] = [];
    const result: number[] = [];
    for await (const item of client.items(first, {
      decodeEntry(value) {
        assert.equal(typeof value, "string");
        seen.push(value);
        return Number(value);
      },
    }))
      result.push(item);
    assert.deepEqual(result, [1, 2]);
    assert.deepEqual(seen, ["1", "2"]);
    assert.equal(requests, 1);
    assert.deepEqual(first.entries, ["1"]);
  });

  it("breaking pagination does not request the next page", async () => {
    let requests = 0;
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        requests++;
        throw new Error("unwanted fetch");
      },
    });
    for await (const page of client.pages({
      start: 0,
      entries: ["first"],
      next_collection_link: `${baseUrl}page?ws.start=1`,
    })) {
      assert.deepEqual(page.entries, ["first"]);
      break;
    }
    assert.equal(requests, 0);
  });

  it("pagination rejects malformed envelopes and normalized link cycles", async () => {
    let requests = 0;
    const next = `${baseUrl}page`;
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        requests++;
        return Response.json({
          start: 1,
          entries: [],
          next_collection_link: `${baseUrl}./page`,
        });
      },
    });
    for (const malformed of [
      null,
      { start: 0.5, entries: [] },
      { start: 0, entries: null },
      { start: 0, entries: [], next_collection_link: 42 },
    ]) {
      await assert.rejects(async () => {
        for await (const page of client.pages(malformed)) void page;
      }, TypeError);
    }
    await assert.rejects(async () => {
      for await (const page of client.pages({
        start: 0,
        entries: [],
        next_collection_link: next,
      }))
        void page;
    }, TypeError);
    assert.equal(requests, 1);
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
