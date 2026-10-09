import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createLaunchpadClient } from "../../index.js";
import { launchpadCollectionSchema } from "../../schemas/primitives.js";
import { z } from "zod";
import { COLLECTION_LINK_FIELDS } from "../../constants.ts";

const baseUrl = "https://example.test/api/devel/";

describe("pagination contract", () => {
  it("shares optional link validation with the opt-in schema without losing extra fields", async () => {
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => {
        throw new Error("Validating the first page must not fetch");
      },
    });
    const schema = launchpadCollectionSchema(z.unknown());
    for (const link of COLLECTION_LINK_FIELDS) {
      const page = {
        start: 0,
        entries: [],
        extra: true,
        [link]: `${baseUrl}next`,
      };
      assert.deepEqual(schema.parse(page), page);
      const iterator = client.pages(page);
      assert.equal((await iterator.next()).value, page);
      await iterator.return?.(undefined);

      const malformed = { ...page, [link]: 42 };
      assert.equal(schema.safeParse(malformed).success, false);
      await assert.rejects(client.pages(malformed).next(), TypeError);
    }
  });

  it("normalizes cycle keys without rewriting requests or conflating encoded separators", async () => {
    const links = [
      `${baseUrl}%70age?a=1&b=2`,
      `${baseUrl}path%2fchild`,
      `${baseUrl}path/child`,
      `${baseUrl}page?b=2&a=1`,
    ];
    const requested: string[] = [];
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async (request) => {
        assert.ok(request instanceof Request);
        requested.push(request.url);
        return Response.json({
          start: requested.length,
          entries: [],
          next_collection_link: links[requested.length],
        });
      },
    });
    await assert.rejects(async () => {
      for await (const page of client.pages({
        start: 0,
        entries: [],
        next_collection_link: links[0],
      }))
        void page;
    }, /Cyclic next_collection_link/);
    assert.deepEqual(requested, links.slice(0, 3));
  });
});
