# Agent guide

Read the applicable guides in [docs/code-standards/](docs/code-standards/). Consult [docs/tooling/better-result.md](docs/tooling/better-result.md) when changing error handling.

## Related upstream repositories

- [Launchpad server](https://code.launchpad.net/~launchpad/launchpad/+git/launchpad) is authoritative for server behavior, canonical URL traversal, exported Python interfaces, and registered JSON serialization contracts.
- [Launchpad OpenAPI converter](https://code.launchpad.net/~launchpad-committers/launchpad-openapi/+git/launchpad-openapi) converts WADL and authoritative Launchpad metadata into OpenAPI. It owns response types, nullability, route coverage, and semantic operation IDs.
- [TypeScript client](https://code.launchpad.net/~launchpad-committers/launchpad-typescript-client/+git/launchpad-typescript-client) consumes the OpenAPI snapshot. It owns Fetch transport, wire serialization, authentication hooks, HTTP errors, pagination, code-generation adaptation, and package exports.

### Responsibility boundaries and generation flow

- Fix incorrect server behavior or traversal in Launchpad. Fix incorrect OpenAPI descriptions or metadata extraction in the converter, using Launchpad's interfaces and serializers as evidence.
- Fix transport, generation adaptation, or packaging defects in this client. Adaptation must preserve upstream semantics: do not invent missing types, relabel operation IDs, or maintain client-side field-correction registries.
- After an upstream contract change, generate the corrected OpenAPI snapshot, import it verbatim into the client, and regenerate types and schemas. Keep all OpenAPI-derived artifacts together in the generated output area; never hand-edit them.
- Record the actual converter provenance when regenerating. The client's registry-based schema refresh uses its configured converter version; changes to the upstream converter do not automatically update that dependency or the client's checked-in snapshot.

## Respect

- Preserve WADL-derived semantics and produce valid OpenAPI 3.0.3; do not invent missing source information.
- Keep changes in the owning module and follow existing domain boundaries and export conventions.
- Use precise names for meaningful intermediate values; leave trivial one-use expressions inline.
- Test observable behavior: unit tests beside source, shared fixtures in `testing/`, integration tests in `src/testing/integration/`.
- For behavior changes, main coordinates **contract → RED → GREEN → QA**:
  the test agent confirms a meaningful failure before implementation;
  the implementation agent passes tests without weakening them;
  independent QA checks the contract and actual behavior.
  Report verification. Do not commit or push unless explicitly requested.
- Avoid including extra tests target every code bahavior, instead focus on meaningful tests

