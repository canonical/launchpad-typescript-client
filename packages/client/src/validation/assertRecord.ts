/**
 * Narrow an unknown value to an object with unknown fields.
 *
 * Rejects null, arrays, and primitives without copying or coercing the input.
 * This is only an object-boundary check: it does not establish a plain-object
 * prototype or validate any property values.
 *
 * @throws TypeError identifying the caller's label when the value is not an object.
 */
export default function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}
