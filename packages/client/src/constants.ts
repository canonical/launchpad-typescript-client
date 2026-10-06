/**
 * Optional string links in the hand-written Launchpad collection envelope.
 *
 * Both the Zod schema and Zod-free pagination checks use this list. These are
 * envelope fields, not inferred resource fields or corrections to generated APIs.
 */
export const COLLECTION_LINK_FIELDS = [
  "resource_type_link",
  "total_size_link",
  "next_collection_link",
  "prev_collection_link",
] as const;
