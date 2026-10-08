/**
 * Failures owned by the HTTP boundary, retaining the consumed Fetch response.
 * Network, cancellation, and pagination-entry decoder errors are not wrapped.
 */

/**
 * Non-2xx final response, with status, headers, and response body.
 * The body is parsed JSON when available, otherwise text or undefined if empty.
 */
export class LaunchpadApiError extends Error {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
  readonly response: Response;

  constructor(response: Response, body: unknown) {
    super(`Launchpad returned HTTP ${response.status}`);
    this.name = "LaunchpadApiError";
    this.status = response.status;
    this.headers = response.headers;
    this.body = body;
    this.response = response;
  }
}

/**
 * Successful HTTP response whose JSON parsing or caller-supplied decoder failed.
 * The original failure is available as cause; HTTP metadata remains accessible.
 */
export class LaunchpadDecodeError extends Error {
  readonly status: number;
  readonly headers: Headers;
  readonly response: Response;

  constructor(response: Response, cause: unknown) {
    super("Launchpad response decoding failed", { cause });
    this.name = "LaunchpadDecodeError";
    this.status = response.status;
    this.headers = response.headers;
    this.response = response;
  }
}
