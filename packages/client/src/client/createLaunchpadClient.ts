import appendFields from "../fields/appendFields.js";
import createTransport from "../http/createTransport.js";
import resolveTarget from "../http/resolveTarget.js";
import sendRequest from "../http/sendRequest.js";
import type {
  LaunchpadClientOptions,
  LaunchpadDecodeOptions,
  LaunchpadRawRequest,
  LaunchpadRequestOptions,
  LaunchpadResponse,
  RequestSettings,
} from "../types.js";

/**
 * Create a Fetch client without importing a validation runtime.
 *
 * Raw data stays unknown unless decoded. Responses are consumed, redirects are
 * not followed, and absolute links cannot leave the configured API origin/prefix.
 *
 * @param options - API prefix, authentication, and Fetch implementation. Defaults
 * to https://api.launchpad.net/devel/, anonymous auth, and the runtime's Fetch.
 * @returns A raw request method with explicit body encoding and optional decoding.
 * @throws TypeError for invalid configuration.
 * @note Reads runtime defaults; returned methods perform Fetch I/O.
 */
export function createLaunchpadClient(options: LaunchpadClientOptions = {}) {
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
    appendFields(url.searchParams, input.query);
    return sendRequest(transport, url, input, settings);
  }

  return { requestRaw };
}
