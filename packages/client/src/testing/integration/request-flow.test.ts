import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  createLaunchpadClient,
  LaunchpadApiError,
  LaunchpadDecodeError,
} from "../../index.js";
import { zodFreeClientConsumer } from "../../../testing/fixtures.ts";

const baseUrl = "https://example.test/api/devel/";

describe("request flow", () => {
  it("signs final raw wire requests without consuming their bodies", async () => {
    const signed: { request: Request; body: string }[] = [];
    const fetched: { request: Request; body: string }[] = [];
    const client = createLaunchpadClient({
      baseUrl,
      auth: {
        type: "oauth1",
        async signer(request) {
          signed.push({ request, body: await request.text() });
          return "OAuth test-signature";
        },
      },
      fetch: async (request) => {
        assert.ok(request instanceof Request);
        fetched.push({ request, body: await request.text() });
        return Response.json({ answer: "42" });
      },
    });
    const { data } = await client.requestRaw(
      {
        path: "values",
        method: "POST",
        query: { ids: ["1", "2"], missing: undefined, unset: null },
        headers: { "X-Example": "input", "Content-Type": "text/plain" },
        body: { encoding: "json", value: { answer: "42" } },
      },
      {
        headers: { "X-Example": "options" },
        decode: (value) => Number((value as { answer: string }).answer),
      },
    );
    assert.equal(data, 42);
    assert.equal(fetched.length, 1);
    for (const [index, outgoing] of fetched.entries()) {
      assert.equal(outgoing.request.url, signed[index].request.url);
      assert.equal(outgoing.body, signed[index].body);
      assert.equal(
        outgoing.request.headers.get("Authorization"),
        "OAuth test-signature",
      );
      assert.equal(signed[index].request.headers.get("Authorization"), null);
      assert.equal(outgoing.request.redirect, "manual");
      assert.equal(outgoing.request.credentials, "omit");
      assert.equal(outgoing.request.headers.get("Accept"), "application/json");
    }
    const rawUrl = new URL(fetched[0].request.url);
    assert.equal(rawUrl.searchParams.get("ids"), '["1","2"]');
    assert.equal(rawUrl.searchParams.get("unset"), "null");
    assert.equal(rawUrl.searchParams.has("missing"), false);
    assert.equal(fetched[0].request.headers.get("X-Example"), "options");
    assert.equal(
      fetched[0].request.headers.get("Content-Type"),
      "application/json",
    );
  });

  it("keeps empty, JSON-null, and text bodies distinct and preserves HTTP/decode failure precedence", async () => {
    let response = Response.json(null);
    const client = createLaunchpadClient({
      baseUrl,
      fetch: async () => response,
    });
    for (const [next, expected] of [
      [Response.json(null), null],
      [new Response(null, { status: 204 }), undefined],
      [
        new Response("plain text", {
          headers: { "Content-Type": "text/plain" },
        }),
        "plain text",
      ],
    ] as const) {
      response = next;
      const result = await client.requestRaw({ path: "resource" });
      assert.equal(result.data, expected);
      assert.equal(result.response, response);
    }
    response = Response.json(42);
    const decoding = {
      prefix: "decoded:",
      decode(value: unknown) {
        return `${this.prefix}${value}`;
      },
    };
    assert.equal(
      (await client.requestRaw({ path: "resource" }, decoding)).data,
      "decoded:42",
    );
    response = new Response("not JSON", {
      headers: { "Content-Type": "application/json" },
    });
    await assert.rejects(client.requestRaw({ path: "resource" }), (error) => {
      assert.ok(error instanceof LaunchpadDecodeError);
      assert.ok(error.cause instanceof SyntaxError);
      assert.equal(error.response, response);
      return true;
    });
    response = new Response("not JSON", {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    let decodes = 0;
    await assert.rejects(
      client.requestRaw(
        { path: "resource" },
        {
          decode: () => {
            decodes++;
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof LaunchpadApiError);
        assert.equal(error.body, "not JSON");
        assert.equal(error.status, 400);
        assert.equal(error.response, response);
        return true;
      },
    );
    assert.equal(decodes, 0);
    response = Response.json({ value: "invalid" });
    const cause = new Error("decoder rejected response");
    await assert.rejects(
      client.requestRaw(
        { path: "resource" },
        {
          decode: () => {
            throw cause;
          },
        },
      ),
      (error) => {
        assert.ok(error instanceof LaunchpadDecodeError);
        assert.equal(error.cause, cause);
        assert.equal(error.response, response);
        return true;
      },
    );
  });

  it("imports and uses the transport without loading Zod", () => {
    execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", zodFreeClientConsumer],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        stdio: "pipe",
      },
    );
  });
});
