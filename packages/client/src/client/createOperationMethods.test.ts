import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createLaunchpadClient } from "./createLaunchpadClient.js";
import createOperationMethods from "./createOperationMethods.js";

describe("createOperationMethods", () => {
  it("binds namespace leaves to real requests and keeps extracted methods callable", async () => {
    const requests: Request[] = [];
    const client = createLaunchpadClient({
      baseUrl: "https://example.test/devel/",
      fetch: async (request) => {
        assert.ok(request instanceof Request);
        requests.push(request);
        return Response.json({ display_name: "Launchpad" });
      },
    });
    const methods = createOperationMethods(client.request, {
      project: { get: "project.get" },
      constructor: { toString: { get: "project.get" } },
    });
    const get = methods.project.get;
    const input = { path: { project: "launchpad" } };
    const plain = await get(input);
    assert.deepEqual(plain.data, { display_name: "Launchpad" });
    assert.equal(
      (await methods.constructor.toString.get(input, { decode: String })).data,
      "[object Object]",
    );
    assert.equal(requests[0].url, "https://example.test/devel/launchpad");
    assert.equal(requests[1].url, requests[0].url);
    assert.equal(Object.getPrototypeOf(methods.project), null);
  });
});
