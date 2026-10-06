import { COLLECTION_LINK_FIELDS } from "../constants.js";
import assertRecord from "../validation/assertRecord.js";
import type { LaunchpadCollection } from "../schemas/primitives.js";
import resolveTarget from "../http/resolveTarget.js";
import sendRequest from "../http/sendRequest.js";
import type { PaginationSettings, Transport } from "../types.js";

const PERCENT_ENCODED_BYTE = /%[\da-f]{2}/gi;
const UNRESERVED_URI_CHARACTER = /^[a-z\d._~-]$/i;

function validateCollection(
  value: unknown,
): asserts value is LaunchpadCollection<unknown> {
  assertRecord(value, "Launchpad collection");
  const page = value;
  if (!Number.isInteger(page.start) || !Array.isArray(page.entries)) {
    throw new TypeError(
      "Expected a Launchpad collection with integer start and array entries",
    );
  }
  for (const key of COLLECTION_LINK_FIELDS) {
    if (page[key] !== undefined && typeof page[key] !== "string") {
      throw new TypeError(`Collection ${key} must be a string when present`);
    }
  }
  if (
    page.total_size !== undefined &&
    (typeof page.total_size !== "number" || !Number.isFinite(page.total_size))
  ) {
    throw new TypeError(
      "Collection total_size must be a finite number when present",
    );
  }
}

/**
 * Identify equivalent next links without altering the URL sent to the server.
 *
 * Sort query keys and normalize percent escapes. Decode only URI-unreserved
 * characters (letters, digits, dot, underscore, tilde, hyphen); encoded reserved
 * characters such as a slash must remain distinct from path separators.
 */
function createCycleKey(url: URL): string {
  const normalized = new URL(url);
  normalized.searchParams.sort();
  normalized.pathname = normalized.pathname.replace(
    PERCENT_ENCODED_BYTE,
    (escape) => {
      const character = String.fromCharCode(
        Number.parseInt(escape.slice(1), 16),
      );
      return UNRESERVED_URI_CHARACTER.test(character)
        ? character
        : escape.toUpperCase();
    },
  );
  return normalized.href;
}

/**
 * Validate collection envelopes and optionally decode their entries lazily.
 *
 * The first page is caller-supplied data, not a response wrapper. Subsequent pages
 * follow next_collection_link through the same URL confinement and HTTP pipeline
 * as ordinary requests. No offsets are synthesized and no totals are fetched.
 *
 * @throws TypeError for invalid envelopes, decoders, links, or repeated next links.
 * Entry decoder and cancellation errors propagate unchanged.
 * @note Fetches only when the iterator advances beyond a yielded page.
 */
export default async function* iteratePages(
  transport: Transport,
  firstPage: unknown,
  settings: PaginationSettings = {},
): AsyncIterableIterator<LaunchpadCollection<unknown>> {
  const decodeEntry = settings.decodeEntry;
  if (decodeEntry !== undefined && typeof decodeEntry !== "function") {
    throw new TypeError("decodeEntry must be a function");
  }
  const visited = new Set<string>();
  let value = firstPage;
  while (true) {
    settings.signal?.throwIfAborted();
    validateCollection(value);
    const page = value;
    yield decodeEntry === undefined
      ? page
      : { ...page, entries: page.entries.map((entry) => decodeEntry(entry)) };
    const next = page.next_collection_link;
    if (next === undefined) return;
    const url = resolveTarget(transport.base, { resourceUrl: next });
    const key = createCycleKey(url);
    if (visited.has(key)) throw new TypeError("Cyclic next_collection_link");
    visited.add(key);
    value = (await sendRequest(transport, url, {}, settings)).data;
  }
}
