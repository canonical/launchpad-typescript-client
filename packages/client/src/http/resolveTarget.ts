const HTTP_URL_PREFIX = /^https?:\/\//i;
const ABSOLUTE_OR_NETWORK_PATH = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const INVALID_PERCENT_ESCAPE = /%(?![\da-f]{2})/i;
const LEADING_SLASHES = /^\/+/;

function hasInvalidUrlCharacters(
  value: string,
  rejectSpaces: boolean,
): boolean {
  // WHATWG URL parsing can discard controls or interpret backslashes as slashes.
  // Reject them before parsing so confinement checks see the caller's intent.
  const lastForbiddenCode = rejectSpaces ? 0x20 : 0x1f;
  const deleteCode = 0x7f;
  const backslashCode = 0x5c;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code <= lastForbiddenCode ||
      code === deleteCode ||
      code === backslashCode
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve exactly one API-relative path or absolute resource link.
 *
 * Leading slashes on relative paths do not replace the configured API prefix.
 * Absolute links must retain the base's origin and full path prefix. Credentials,
 * fragments, malformed escapes, and URL-parser ambiguities are rejected before
 * the result can reach authentication or Fetch.
 *
 * @param base - Validated API prefix with a trailing slash.
 * @param input - Exactly one path or resourceUrl; values are checked at runtime.
 * @throws TypeError if the target is malformed or leaves the API origin/prefix.
 */
export default function resolveTarget(
  base: URL,
  input: { path?: unknown; resourceUrl?: unknown },
): URL {
  const hasPath = input.path !== undefined;
  const hasUrl = input.resourceUrl !== undefined;
  if (hasPath === hasUrl) {
    throw new TypeError("Specify exactly one of path and resourceUrl");
  }
  let url: URL;
  if (hasUrl) {
    if (
      typeof input.resourceUrl !== "string" ||
      !HTTP_URL_PREFIX.test(input.resourceUrl) ||
      hasInvalidUrlCharacters(input.resourceUrl, true) ||
      INVALID_PERCENT_ESCAPE.test(input.resourceUrl)
    ) {
      throw new TypeError("resourceUrl must be an absolute HTTP(S) URL");
    }
    url = new URL(input.resourceUrl);
  } else {
    if (
      typeof input.path !== "string" ||
      ABSOLUTE_OR_NETWORK_PATH.test(input.path) ||
      input.path !== input.path.trim() ||
      hasInvalidUrlCharacters(input.path, false) ||
      INVALID_PERCENT_ESCAPE.test(input.path)
    ) {
      throw new TypeError("path must be API-relative");
    }
    url = new URL(input.path.replace(LEADING_SLASHES, ""), base);
  }
  if (
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname) ||
    url.username ||
    url.password ||
    url.href.includes("#")
  ) {
    throw new TypeError(
      "Request URL is outside the configured API origin/prefix",
    );
  }
  return url;
}
