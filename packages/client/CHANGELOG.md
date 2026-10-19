# Changelog

Notable user-facing changes are recorded here, newest first.

Add changes under **Unreleased**, grouped as Added, Changed, Deprecated, Removed,
Fixed, or Security when applicable. At release time, replace Unreleased with the
version from `package.json` and the publication date, for example
`## [0.0.1] - YYYY-MM-DD`, then start a new Unreleased section.

## [Unreleased]

## [0.0.1] - 2026-10-19

### Added

- Initial experimental release of `@canonical/launchpad-client`, an ESM client
  for Node.js 24 or newer, with typed Launchpad operations exposed through nested
  methods and an operation-ID dispatcher.
- Fetch-based requests with anonymous, cookie, and caller-supplied OAuth1 signing,
  plus distinct HTTP and response-decoding errors.
- Lazy pagination and optional Zod response validation, with separate production
  and qastaging contracts and schemas. Default contracts use qastaging; requests
  connect to production unless a different `baseUrl` is supplied.
- Automatic regeneration from verified snapshots and a clean build before
  packaging or publishing.
