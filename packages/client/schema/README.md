# OpenAPI snapshots

`production/` and `qastaging/` are separate upstream contracts. Each contains
verbatim converter output and a `provenance.json` recording the converter label
and SHA-256 of the exact `openapi.json` bytes.

Generated TypeScript contracts, routing metadata, schemas, and generation reports
belong under `src/generated/<environment>/`, not in this directory.
