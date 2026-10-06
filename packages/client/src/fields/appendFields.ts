import assertRecord from "../validation/assertRecord.js";

function serializeField(value: unknown): string {
  if (value === null || Array.isArray(value)) return JSON.stringify(value);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  throw new TypeError("Query/form values must be primitives or JSON arrays");
}

/**
 * Append query or form fields using Launchpad's wire representation.
 *
 * Undefined fields are omitted, null becomes "null", and arrays are JSON-encoded
 * rather than comma-joined. Existing keys are preserved, not replaced.
 *
 * @throws TypeError for a non-object field map or an unsupported field value.
 * @note Mutates the supplied query/form parameters.
 */
export default function appendFields(
  target: URLSearchParams,
  values: unknown,
): void {
  if (values === undefined) return;
  assertRecord(values, "Query/form fields");
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) target.append(key, serializeField(value));
  }
}
