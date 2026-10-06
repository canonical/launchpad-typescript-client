# OpenAPI snapshots

`production/` and `qastaging/` are separate upstream contracts. Each contains
verbatim converter output and a `provenance.json` recording the converter label
and SHA-256 of the exact `openapi.json` bytes.

These snapshots were produced with `@canonical/launchpad-openapi@0.0.3 (local
upstream)`. That label does not identify an upstream Git revision or guarantee
that the same converter is published in the registry. Do not replace it with the
version of a different installed converter. In particular, the registry 0.0.2
converter predates these snapshots' semantic operation IDs.

Review changes to server contracts in Launchpad or its OpenAPI converter. Import
corrected snapshots verbatim; do not maintain client-side field or operation-ID
corrections. Production and qastaging must each be converted independently.

Generated TypeScript contracts, routing metadata, schemas, and generation reports
belong under `src/generated/<environment>/`, not in this directory.
