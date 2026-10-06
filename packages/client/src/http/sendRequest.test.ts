import { describe, expect, it } from "vitest";
import type { RequestPayload } from "../types.js";
import createTransport from "./createTransport.js";
import sendRequest from "./sendRequest.js";

const url = new URL("https://example.test/api/devel/resource");

describe("sendRequest", () => {
  it("serializes form fields and native streams while retaining cookie and header choices", async () => {
    const fetched: Request[] = [];
    const transport = createTransport({
      auth: { type: "cookie" },
      fetch: async (request) => {
        expect(request).toBeInstanceOf(Request);
        fetched.push(request as Request);
        return new Response(null, { status: 204 });
      },
    });
    await sendRequest(transport, url, {
      method: "POST",
      headers: { Accept: "text/plain" },
      body: {
        encoding: "form",
        value: { count: 2, enabled: false, missing: undefined },
      },
    });
    expect(fetched[0].credentials).toBe("include");
    expect(fetched[0].headers.get("Accept")).toBe("text/plain");
    expect(await fetched[0].text()).toBe("count=2&enabled=false");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("native body"));
        controller.close();
      },
    });
    await sendRequest(transport, url, {
      method: "POST",
      body: { encoding: "native", value: stream },
    });
    expect(await fetched[1].text()).toBe("native body");
    await sendRequest(transport, url, {
      method: "POST",
      body: { encoding: "json", value: undefined },
    });
    expect(await fetched[2].text()).toBe("");
  });

  it("rejects malformed body encodings, fields, and decoders before Fetch", async () => {
    const transport = createTransport({
      fetch: async () => {
        throw new Error("Unexpected Fetch");
      },
    });
    for (const body of [
      null,
      { encoding: "json" },
      { encoding: "unknown", value: "body" },
      { encoding: "json", value: () => undefined },
      { encoding: "form", value: [] },
      { encoding: "form", value: { invalid: {} } },
    ]) {
      await expect(
        sendRequest(transport, url, {
          method: "POST",
          body: body as RequestPayload["body"],
        }),
      ).rejects.toThrow(TypeError);
    }
    await expect(
      // @ts-expect-error JavaScript callers can bypass the decoder's declared type.
      sendRequest(transport, url, {}, { decode: 42 }),
    ).rejects.toThrow(/decode must be a function/);
  });

  it("rejects an empty signing result without sending credentials", async () => {
    const transport = createTransport({
      auth: { type: "oauth1", signer: () => " " },
      fetch: async () => {
        throw new Error("Unexpected Fetch");
      },
    });
    await expect(sendRequest(transport, url, {})).rejects.toThrow(
      /authorization header/,
    );
  });

  it("propagates network failures and cancellation without HTTP wrapping", async () => {
    const failure = new Error("network unavailable");
    const transport = createTransport({
      fetch: async () => {
        throw failure;
      },
    });
    await expect(sendRequest(transport, url, {})).rejects.toBe(failure);
    const aborted = createTransport({
      fetch: async (request) => {
        if (!(request instanceof Request)) throw new Error("Expected Request");
        request.signal.throwIfAborted();
        return Response.json(null);
      },
    });
    await expect(
      sendRequest(
        aborted,
        url,
        {},
        {
          signal: AbortSignal.abort(failure),
        },
      ),
    ).rejects.toBe(failure);
  });
});
