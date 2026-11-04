import assert from "node:assert/strict";
import test from "node:test";
import { versionChanged } from "./version-changed.mjs";

const manifest = { name: "@canonical/example", version: "1.0.0" };

test("ignores manifest edits that leave the version unchanged", () => {
  assert.equal(versionChanged(manifest, { ...manifest, description: "Updated" }), false);
});

test("detects a version change across the synced range", () => {
  assert.equal(versionChanged(manifest, { ...manifest, version: "1.1.0" }), true);
});

test("does not publish a version bump that was reverted before syncing", () => {
  assert.equal(versionChanged(manifest, { ...manifest }), false);
});

test("refuses missing versions, package renames, and private packages", () => {
  for (const after of [
    { ...manifest, version: undefined },
    { ...manifest, version: "" },
    { ...manifest, name: "different-package" },
    { ...manifest, private: true },
  ]) {
    assert.throws(() => versionChanged(manifest, after));
  }
});
