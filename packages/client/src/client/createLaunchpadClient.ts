import type {
  Input,
  OperationId,
  Output,
} from "../generated/production/contracts.js";
import { operationPaths } from "../generated/production/operations.js";
import iteratePages from "./iteratePages.js";
import createOperationMethods from "./createOperationMethods.js";
import prepareOperation from "./prepareOperation.js";
import type { LaunchpadCollection } from "../schemas/primitives.js";
import setFields from "../fields/setFields.js";
import createTransport from "../http/createTransport.js";
import resolveTarget from "../http/resolveTarget.js";
import sendRequest from "../http/sendRequest.js";
import type {
  LaunchpadClient,
  LaunchpadClientOptions,
  LaunchpadDecodeOptions,
  LaunchpadDecodedPaginationOptions,
  LaunchpadPaginationOptions,
  LaunchpadRawRequest,
  LaunchpadRequestOptions,
  LaunchpadResponse,
  PaginationSettings,
  RequestSettings,
} from "../types.js";

/**
 * Create a Fetch client without importing a validation runtime.
 *
 * Generated requests infer documented output types without validating responses;
 * raw data stays unknown unless decoded. Responses are consumed. Initial targets
 * cannot leave the configured API origin/prefix; Fetch follows redirects without
 * validating their destinations.
 *
 * @param options - API prefix, authentication, and Fetch implementation. Defaults
 * to https://api.launchpad.net/devel/, anonymous auth, and the runtime's Fetch.
 * @returns Generated/raw requests, nested methods for dotted upstream IDs, and
 * lazy page/entry iterators.
 * @throws TypeError for invalid configuration.
 * @note Reads runtime defaults; returned methods perform Fetch I/O.
 */
export function createLaunchpadClient(
  options: LaunchpadClientOptions = {},
): LaunchpadClient {
  const transport = createTransport(options);

  /**
   * Request an API-relative path or confined absolute resource URL.
   *
   * Body encoding is explicit. Data remains unknown unless a decoder is supplied;
   * decoder failures become LaunchpadDecodeError with the original cause.
   *
   * @returns Parsed data and the consumed Fetch response.
   * @note Performs Fetch I/O using the configured authentication strategy.
   */
  function requestRaw<T>(
    input: LaunchpadRawRequest,
    settings: LaunchpadDecodeOptions<T>,
  ): Promise<LaunchpadResponse<T>>;
  function requestRaw(
    input: LaunchpadRawRequest,
    settings?: LaunchpadRequestOptions,
  ): Promise<LaunchpadResponse<unknown>>;
  async function requestRaw(
    input: LaunchpadRawRequest,
    settings?: RequestSettings,
  ): Promise<LaunchpadResponse<unknown>> {
    const url = resolveTarget(transport.base, input);
    setFields(url.searchParams, input.query);
    return sendRequest(transport, url, input, settings);
  }

  /**
   * Request a generated operation using its path, query, and body contracts.
   *
   * The operation selects the documented output type but does not validate the
   * response. An explicit decoder overrides that type and validates or transforms
   * the data. Fixed operation parameters cannot be overridden by callers.
   *
   * @returns Parsed data and the consumed Fetch response.
   * @note Performs Fetch I/O after resolving the generated request metadata.
   */
  function request<K extends OperationId, T>(
    operationId: K,
    input: Input<K>,
    settings: LaunchpadDecodeOptions<T>,
  ): Promise<LaunchpadResponse<T>>;
  function request<K extends OperationId>(
    operationId: K,
    input: Input<K>,
    settings?: LaunchpadRequestOptions,
  ): Promise<LaunchpadResponse<Output<K>>>;
  function request<K extends OperationId>(
    operationId: K,
    input: Input<K>,
    settings?: RequestSettings,
  ): Promise<LaunchpadResponse<unknown>> {
    const { url, payload } = prepareOperation(
      transport.base,
      operationId,
      input,
    );
    return sendRequest(transport, url, payload, settings);
  }

  /**
   * Iterate collection pages, following the server's next links lazily.
   *
   * Pass collection data, not the HTTP response wrapper. Each envelope is checked;
   * entries remain unknown unless decodeEntry is supplied. The decoder applies
   * to the first page as well as fetched pages and its failures propagate unchanged.
   *
   * @throws TypeError for malformed envelopes, disallowed links, or link cycles.
   * @note Fetches the next page only after iteration resumes past the current page.
   */
  function pages<T>(
    firstPage: unknown,
    settings: LaunchpadDecodedPaginationOptions<T>,
  ): AsyncIterableIterator<LaunchpadCollection<T>>;
  function pages(
    firstPage: unknown,
    settings?: LaunchpadPaginationOptions,
  ): AsyncIterableIterator<LaunchpadCollection<unknown>>;
  function pages(
    firstPage: unknown,
    settings?: PaginationSettings,
  ): AsyncIterableIterator<LaunchpadCollection<unknown>> {
    return iteratePages(transport, firstPage, settings);
  }

  /**
   * Iterate entries from collection data using the same checks as pages().
   *
   * Entries remain unknown without decodeEntry. Breaking iteration does not fetch
   * another page; cancellation is controlled by the supplied AbortSignal.
   *
   * @throws TypeError for malformed envelopes, disallowed links, or link cycles.
   * @note Fetches subsequent pages only as the consumer advances.
   */
  function items<T>(
    firstPage: unknown,
    settings: LaunchpadDecodedPaginationOptions<T>,
  ): AsyncIterableIterator<T>;
  function items(
    firstPage: unknown,
    settings?: LaunchpadPaginationOptions,
  ): AsyncIterableIterator<unknown>;
  async function* items(
    firstPage: unknown,
    settings?: PaginationSettings,
  ): AsyncIterableIterator<unknown> {
    for await (const page of pages(firstPage, settings)) yield* page.entries;
  }

  return {
    ...createOperationMethods(request, operationPaths),
    request,
    requestRaw,
    pages,
    items,
  };
}
