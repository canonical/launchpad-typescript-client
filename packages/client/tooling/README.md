# Client tooling

Snapshot refresh and code generation are deliberately separate. Refreshing may
access Launchpad and changes the saved API contract; generation works offline
from that contract. This keeps rebuilding the client independent of network
availability and upstream changes.

See the [client development guide](../README.md) for setup and commands.

## Offline generation

Running `pnpm generate` from the client package verifies each snapshot against
its saved hash and converter provenance before preparing generator input.
Production and qastaging run in separate processes because the generator retains
process-wide state.

Preparation adapts only the in-memory document: it exposes route alternatives
and makes OpenAPI's default open-object behavior explicit. Original URLs and
operation IDs remain the source of transport metadata; synthetic generator paths
must never become request URLs. These adaptations are not corrections to the
upstream API contract and are never written back to the snapshots.

The generator assigns final exported names after routing symbols into resource
modules. Binding therefore waits until generation finishes, then associates
those names with their source components and operations. Missing bindings and
name collisions fail generation rather than silently dropping schemas or
inventing numbered names.

After these checks, contracts, transport metadata, validators, and the generation
report are written under `src/generated/<environment>/`. Temporary generator
output is removed even if generation fails.

## Packaging a release

Install the development and tooling dependencies first, then run from the client
package directory:

```sh
npm pack --dry-run
npm publish
```

Both commands run `prepack`: it regenerates contracts, transport metadata, and
schemas for production and qastaging from the saved snapshots, then compiles a
clean build. Invalid snapshot provenance, generation errors, or compilation
errors stop packaging and publishing instead of reusing stale output.

This does not fetch new API definitions or change the saved snapshots. Refresh
and review snapshots explicitly before releasing if the API contract needs updating.

## Snapshot refresh

Run `pnpm schema:update` explicitly when the saved contract needs updating. The
selected upstream converter's output is imported verbatim under
`schema/<environment>/`, alongside its actual version and the source hash.
Generation uses this provenance to detect stale or mismatched snapshots.

Incorrect API descriptions belong in the upstream converter or Launchpad itself,
not in client-side field corrections. Refresh the corrected snapshot before
regenerating the client.
