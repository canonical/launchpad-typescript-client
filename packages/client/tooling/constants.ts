/**
 * Snapshot targets are separate contracts, not interchangeable host aliases.
 */
export const ENVIRONMENTS = ["production", "qastaging"] as const;

/**
 * OpenAPI operation keys; other path-item properties are metadata, not operations.
 */
export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

/**
 * Converter provenance must identify an actual version, optionally a local build.
 */
export const CONVERTER_PATTERN =
  /^@canonical\/launchpad-openapi@\d+\.\d+\.\d+(?: \(local upstream\))?$/;
