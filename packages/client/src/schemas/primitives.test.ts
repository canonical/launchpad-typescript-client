import { describe, expect, it } from "vitest";
import { z } from "zod";
import { COLLECTION_LINK_FIELDS } from "../constants.js";
import {
  launchpadCollectionSchema,
  launchpadResourceSchema,
} from "./primitives.js";

describe("launchpadResourceSchema", () => {
  it("preserves unknown fields without fabricating identity metadata", () => {
    expect(launchpadResourceSchema.parse({ custom: true })).toEqual({
      custom: true,
    });
    expect(launchpadResourceSchema.safeParse({ self_link: 42 }).success).toBe(
      false,
    );
  });
});

describe("launchpadCollectionSchema", () => {
  it("validates the envelope while transforming entries and preserving extra fields", () => {
    const schema = launchpadCollectionSchema(z.string().transform(Number));
    expect(schema.parse({ start: 0, entries: ["42"], custom: true })).toEqual({
      start: 0,
      entries: [42],
      custom: true,
    });
    expect(schema.safeParse({ start: 0.5, entries: [] }).success).toBe(false);
    expect(schema.safeParse({ start: 0, entries: null }).success).toBe(false);
    expect(
      schema.safeParse({ start: 0, entries: [], total_size: Infinity }).success,
    ).toBe(false);
    for (const field of COLLECTION_LINK_FIELDS) {
      expect(
        schema.safeParse({ start: 0, entries: [], [field]: 42 }).success,
      ).toBe(false);
    }
  });
});
