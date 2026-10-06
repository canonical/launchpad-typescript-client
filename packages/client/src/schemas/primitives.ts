/**
 * Opt-in schemas for resource identity and collection envelopes.
 *
 * These hand-written primitives preserve extra server fields. Transport consumes
 * their inferred types only; importing the client does not load Zod.
 */
import { z } from "zod";
import { COLLECTION_LINK_FIELDS } from "../constants.js";

// Object.fromEntries loses literal keys; each declared link gets the same schema.
const collectionLinkShape = Object.fromEntries(
  COLLECTION_LINK_FIELDS.map((field) => [field, z.string().optional()]),
) as Record<
  (typeof COLLECTION_LINK_FIELDS)[number],
  z.ZodOptional<z.ZodString>
>;

/**
 * Validate optional string identity metadata while preserving undocumented fields.
 * Missing metadata stays absent; no identity is fabricated for generic resources.
 */
export const launchpadResourceSchema = z.looseObject({
  self_link: z.string().optional(),
  resource_type_link: z.string().optional(),
  http_etag: z.string().optional(),
  web_link: z.string().optional(),
});

/**
 * Optional resource identity metadata; additional fields remain unknown.
 */
export type LaunchpadResource = z.output<typeof launchpadResourceSchema>;

/**
 * Validate an integer-start collection envelope and each entry with the supplied schema.
 *
 * Optional links must be strings and total_size must be finite. Unknown envelope
 * fields are preserved. Entry transforms determine the resulting entry type.
 */
export function launchpadCollectionSchema<T extends z.ZodType>(entrySchema: T) {
  return z.looseObject({
    start: z.number().int(),
    entries: z.array(entrySchema),
    ...collectionLinkShape,
    total_size: z.number().optional(),
  });
}

/**
 * Collection envelope with decoded entry outputs, not the entry schema's inputs.
 * Entry types are trustworthy only after an entry decoder has run.
 */
export type LaunchpadCollection<T> = z.output<
  ReturnType<typeof launchpadCollectionSchema<z.ZodType<T>>>
>;
