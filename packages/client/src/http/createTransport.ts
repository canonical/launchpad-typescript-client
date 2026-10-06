import type {
  LaunchpadAuth,
  LaunchpadClientOptions,
  Transport,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.launchpad.net/devel/";

function parseBaseUrl(baseUrl: string = DEFAULT_BASE_URL): URL {
  if (typeof baseUrl !== "string") {
    throw new TypeError("API base must be a URL string");
  }
  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.href.includes("?") ||
    base.href.includes("#")
  ) {
    throw new TypeError(
      "API base must be an HTTP(S) URL without credentials, query, or fragment",
    );
  }
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return base;
}

function validateAuth(auth: LaunchpadAuth): void {
  if (
    auth === null ||
    typeof auth !== "object" ||
    !["anonymous", "cookie", "oauth1"].includes(auth.type)
  ) {
    throw new TypeError("Unknown authentication strategy");
  }
  if (auth.type === "oauth1" && typeof auth.signer !== "function") {
    throw new TypeError("OAuth1 mode requires a signer");
  }
}

/**
 * Validate configuration once for all requests and pagination links.
 *
 * The base retains its complete API path and gains a trailing slash so URL
 * resolution and prefix confinement use the same boundary. Authentication
 * defaults to anonymous; no strategy is inferred from the destination host.
 *
 * @throws TypeError if the base URL, authentication strategy, or Fetch is invalid.
 * @note Reads the runtime's Fetch when no implementation is supplied.
 */
export default function createTransport(
  options: LaunchpadClientOptions,
): Transport {
  const base = parseBaseUrl(options.baseUrl);
  const auth: LaunchpadAuth =
    options.auth === undefined ? { type: "anonymous" } : options.auth;
  validateAuth(auth);
  const fetcher =
    options.fetch === undefined ? globalThis.fetch : options.fetch;
  if (typeof fetcher !== "function") {
    throw new TypeError("A Fetch implementation is required");
  }
  return { base, auth, fetcher };
}
