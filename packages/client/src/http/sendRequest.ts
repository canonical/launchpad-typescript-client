import { LaunchpadApiError, LaunchpadDecodeError } from "../errors.js";
import setFields from "../fields/setFields.js";
import type {
  LaunchpadAuth,
  LaunchpadRequestOptions,
  LaunchpadResponse,
  RequestPayload,
  RequestSettings,
  Transport,
} from "../types.js";

const JSON_CONTENT_TYPE = /\bjson\b/i;

/**
 * Serialize the explicitly selected body encoding.
 *
 * @note Sets the encoding's media type on the supplied headers.
 */
function serializeBody(
  body: RequestPayload["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (body === undefined) return undefined;
  if (body === null || typeof body !== "object" || !("value" in body)) {
    throw new TypeError("A body must specify its encoding and value");
  }
  switch (body.encoding) {
    case "json": {
      const serialized = JSON.stringify(body.value);
      if (serialized === undefined && body.value !== undefined) {
        throw new TypeError("JSON body is not serializable");
      }
      headers.set("Content-Type", "application/json");
      return serialized;
    }
    case "form": {
      const form = new URLSearchParams();
      setFields(form, body.value);
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      return form.toString();
    }
    case "native":
      return body.value;
    default:
      throw new TypeError("Unknown body encoding");
  }
}

function serializeRequest(
  auth: LaunchpadAuth,
  url: URL,
  input: RequestPayload,
  settings: LaunchpadRequestOptions,
): Request {
  const headers = new Headers(input.headers);
  new Headers(settings.headers).forEach((value, key) =>
    headers.set(key, value),
  );
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const body = serializeBody(input.body, headers);
  const init: RequestInit & { duplex?: "half" } = {
    method: input.method === undefined ? "GET" : input.method,
    headers,
    redirect: "follow",
    credentials: auth.type === "cookie" ? "include" : "omit",
  };
  if (body !== undefined) init.body = body;
  if (settings.signal !== undefined) init.signal = settings.signal;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
    init.duplex = "half";
  return new Request(url, init);
}

/**
 * Read HTTP data before applying any caller-supplied decoder.
 *
 * HTTP failures take precedence over JSON or decoder failures. Empty bodies,
 * JSON null, and text responses remain distinct.
 *
 * @note Consumes the response body and invokes the caller's decoder.
 */
async function readResponse(
  response: Response,
  settings: RequestSettings,
): Promise<LaunchpadResponse<unknown>> {
  // TODO: Add opt-in responseType: "arrayBuffer"; text decoding is not binary-safe.
  const text = await response.text();
  let data: unknown = text === "" ? undefined : text;
  if (
    text !== "" &&
    JSON_CONTENT_TYPE.test(response.headers.get("content-type") ?? "")
  ) {
    try {
      data = JSON.parse(text);
    } catch (cause) {
      if (response.ok) throw new LaunchpadDecodeError(response, cause);
    }
  }
  if (!response.ok) throw new LaunchpadApiError(response, data);
  if (settings.decode !== undefined) {
    try {
      data = settings.decode(data);
    } catch (cause) {
      throw new LaunchpadDecodeError(response, cause);
    }
  }
  return { data, response };
}

/**
 * Serialize, optionally sign, and send a request through the shared Fetch pipeline.
 *
 * The initial URL must already be confined to the configured API prefix. Signing
 * receives a clone after serialization so reading its body cannot consume the
 * outgoing request. Fetch follows redirects without validating their destinations
 * or invoking the signer again. Network and abort errors propagate unchanged.
 *
 * @returns Parsed data and the consumed response; decoding is opt-in.
 * @throws LaunchpadApiError for non-2xx responses, or LaunchpadDecodeError for
 * invalid JSON or decoder failures on successful responses.
 * @note Invokes authentication and Fetch, then consumes the response body.
 */
export default async function sendRequest(
  transport: Transport,
  url: URL,
  input: RequestPayload,
  settings: RequestSettings = {},
): Promise<LaunchpadResponse<unknown>> {
  if (settings.decode !== undefined && typeof settings.decode !== "function") {
    throw new TypeError("decode must be a function");
  }
  const outgoing = serializeRequest(transport.auth, url, input, settings);
  if (transport.auth.type === "oauth1") {
    const authorization = await transport.auth.signer(outgoing.clone());
    if (typeof authorization !== "string" || authorization.trim() === "") {
      throw new TypeError("Signer did not return an authorization header");
    }
    outgoing.headers.set("Authorization", authorization);
  }
  const { fetcher } = transport;
  return readResponse(await fetcher(outgoing), settings);
}
