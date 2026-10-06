/**
 * Public client inputs and the internal contracts shared by client capabilities.
 *
 * Internal payloads and settings reuse public shapes so serialization and decoder
 * signatures cannot drift from the API. Schema-derived resource types live with
 * their schemas, not here.
 */
import type { createLaunchpadClient } from "./client/createLaunchpadClient.js";

/**
 * Client methods inferred from the factory; overloads have one source of truth.
 */
export type LaunchpadClient = ReturnType<typeof createLaunchpadClient>;

/**
 * Explicit authentication strategy, independent of the configured hostname.
 *
 * Anonymous mode omits browser credentials. Cookie mode includes them but does
 * not create a Node cookie jar. OAuth1 delegates signing to the caller.
 */
export type LaunchpadAuth =
  | { type: "anonymous" }
  | { type: "cookie" }
  | {
      type: "oauth1";
      /**
       * Sign a clone of the serialized request and return its Authorization header.
       * Reading the clone's body does not consume the outgoing request.
       * @note Invoked once for each outgoing request, including pagination.
       */
      signer: (request: Request) => string | Promise<string>;
    };

/**
 * Configuration validated once when creating the client.
 */
export interface LaunchpadClientOptions {
  /**
   * Complete HTTP(S) API prefix, including version and any preceding path.
   * Defaults to https://api.launchpad.net/devel/; a trailing slash is added.
   */
  baseUrl?: string;
  /**
   * Authentication strategy; defaults to anonymous.
   */
  auth?: LaunchpadAuth;
  /**
   * Fetch implementation; defaults to the runtime's global Fetch.
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Query/form value: arrays are JSON-encoded, null becomes "null", and scalar
 * primitives become text. This is wire serialization, not schema validation.
 */
export type LaunchpadFieldValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[];

/**
 * Query/form field map; fields whose value is undefined are omitted.
 */
export type LaunchpadFields = Readonly<
  Record<string, LaunchpadFieldValue | undefined>
>;

type EncodedBody<TForm> =
  | { encoding: "json"; value: unknown }
  | { encoding: "form"; value: TForm }
  | { encoding: "native"; value: BodyInit | null };

/**
 * Explicit request-body encoding.
 * JSON and form set their media types; native bodies use Fetch semantics and
 * caller-supplied headers.
 */
export type LaunchpadRawBody = EncodedBody<LaunchpadFields>;

/**
 * Raw request with exactly one API-relative path or confined absolute resource URL.
 * The method defaults to GET. No generated input or output contract is assumed.
 */
export type LaunchpadRawRequest = {
  method?: string;
  headers?: HeadersInit;
  query?: LaunchpadFields;
  body?: LaunchpadRawBody;
} & (
  | { path: string; resourceUrl?: never }
  | { path?: never; resourceUrl: string }
);

/**
 * Per-request headers and cancellation.
 * Headers override input headers except the selected JSON/form media type;
 * network and cancellation errors propagate unchanged.
 */
export interface LaunchpadRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/**
 * Synchronous response decoder whose output establishes the result type.
 * Failures become LaunchpadDecodeError with their original cause and response.
 */
export interface LaunchpadDecodeOptions<T> extends LaunchpadRequestOptions {
  decode: (value: unknown) => T;
}

/**
 * Parsed data and HTTP metadata; the response body has already been consumed.
 * An empty body produces undefined, JSON null stays null, and text stays text.
 */
export interface LaunchpadResponse<T> {
  data: T;
  response: Response;
}

/**
 * Internal request settings reuse the public decoder without requiring it.
 */
export type RequestSettings = Partial<LaunchpadDecodeOptions<unknown>>;

/**
 * Transport payload after routing; generated form values remain unknown until
 * wire serialization validates them.
 */
export type RequestPayload = Pick<LaunchpadRawRequest, "method" | "headers"> & {
  body?: EncodedBody<unknown>;
};

/**
 * Validated configuration shared by request and pagination capabilities.
 * The base URL always has a trailing slash for prefix confinement.
 */
export interface Transport {
  base: URL;
  auth: LaunchpadAuth;
  fetcher: typeof globalThis.fetch;
}
