/**
 * Public client inputs and the internal contracts shared by client capabilities.
 *
 * Internal payloads and settings reuse public shapes so serialization and decoder
 * signatures cannot drift from the API. Schema-derived resource types live with
 * their schemas, not here.
 */
import type {
  Input,
  OperationId,
  Output,
} from "./generated/production/contracts.js";
import type { LaunchpadCollection } from "./schemas/primitives.js";

/**
 * Fetch client with generated operation types, unknown raw data, and pagination.
 * Fetch follows redirects; only the initial request target is confined.
 */
export interface LaunchpadClient {
  /**
   * Request a generated operation with an explicit decoder that overrides its
   * documented output type. Decoder failures become LaunchpadDecodeError.
   */
  request<K extends OperationId, T>(
    operationId: K,
    input: Input<K>,
    settings: LaunchpadDecodeOptions<T>,
  ): Promise<LaunchpadResponse<T>>;
  /**
   * Request a generated operation using its documented input and output types.
   * Responses are not validated; fixed operation arguments cannot be overridden.
   */
  request<K extends OperationId>(
    operationId: K,
    input: Input<K>,
    settings?: LaunchpadRequestOptions,
  ): Promise<LaunchpadResponse<Output<K>>>;
  /**
   * Request an API-relative path or confined absolute resource URL.
   * The decoder determines the data type; failures become LaunchpadDecodeError.
   */
  requestRaw<T>(
    input: LaunchpadRawRequest,
    settings: LaunchpadDecodeOptions<T>,
  ): Promise<LaunchpadResponse<T>>;
  /**
   * Request an API-relative path or confined absolute resource URL without
   * assuming an output schema. Returns parsed data and the consumed response.
   */
  requestRaw(
    input: LaunchpadRawRequest,
    settings?: LaunchpadRequestOptions,
  ): Promise<LaunchpadResponse<unknown>>;
  /**
   * Iterate validated collection pages, decoding entries on every page.
   * Pass collection data, not a response wrapper; decoder failures propagate.
   * @note Fetches subsequent pages lazily using the server's next links.
   */
  pages<T>(
    firstPage: unknown,
    settings: LaunchpadDecodedPaginationOptions<T>,
  ): AsyncIterableIterator<LaunchpadCollection<T>>;
  /**
   * Iterate validated collection pages with unknown entries.
   * @note Fetches subsequent pages lazily using the server's next links.
   */
  pages(
    firstPage: unknown,
    settings?: LaunchpadPaginationOptions,
  ): AsyncIterableIterator<LaunchpadCollection<unknown>>;
  /**
   * Iterate decoded entries from collection data, including the first page.
   * Decoder failures propagate unchanged.
   * @note Fetches subsequent pages only as the consumer advances.
   */
  items<T>(
    firstPage: unknown,
    settings: LaunchpadDecodedPaginationOptions<T>,
  ): AsyncIterableIterator<T>;
  /**
   * Iterate unknown entries from validated collection data.
   * @note Fetches subsequent pages only as the consumer advances.
   */
  items(
    firstPage: unknown,
    settings?: LaunchpadPaginationOptions,
  ): AsyncIterableIterator<unknown>;
}

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
       * @note Invoked once per client request, including pagination, not per
       * Fetch redirect.
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
   * Fetch implementation, invoked without a receiver; defaults to the runtime's
   * global Fetch. Native browser Fetch needs no manual binding.
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * Query/form value: arrays are JSON-encoded, null becomes "null", and scalar
 * primitives become text. Scalar numbers must be finite; array members retain
 * native JSON serialization. This is wire serialization, not schema validation.
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
  /** Supplied non-undefined fields replace matching parameters in the target URL. */
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
 * Headers and cancellation shared by subsequent pagination requests.
 * Undecoded entries remain unknown even when the envelope is valid.
 */
export type LaunchpadPaginationOptions = LaunchpadRequestOptions;

/**
 * Synchronous entry decoder applied to the first and every subsequent page.
 * Unlike response decoders, entry decoder failures propagate unchanged.
 */
export interface LaunchpadDecodedPaginationOptions<
  T,
> extends LaunchpadPaginationOptions {
  decodeEntry: (value: unknown) => T;
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
 * Internal pagination settings reuse the optional public entry decoder.
 */
export type PaginationSettings = Partial<
  LaunchpadDecodedPaginationOptions<unknown>
>;

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
