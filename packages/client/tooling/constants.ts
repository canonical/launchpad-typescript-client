/**
 * Snapshot targets are separate contracts, not interchangeable host aliases.
 */
export const ENVIRONMENTS = ["production", "qastaging"] as const;

/**
 * Converter provenance must identify an actual version, optionally a local build.
 */
export const CONVERTER_PATTERN =
  /^@canonical\/launchpad-openapi@\d+\.\d+\.\d+(?: \(local upstream\))?$/;
