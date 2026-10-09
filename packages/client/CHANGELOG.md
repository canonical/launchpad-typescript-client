# Changelog

## 0.0.1

### Added

- Initial release with native Fetch transport, typed operation requests, optional
  response decoding, authentication hooks, and lazy collection pagination.
- Separate production and qastaging contracts and runtime schema exports.

### Changed

- Generated schema types now use validator-neutral names: `PersonFullZodType`
  becomes `PersonFull`, for example. Operation types retain role suffixes such as
  `ProjectGetResponse`. Update imports from development checkouts accordingly;
  runtime schema names such as `zPersonFull` are unchanged.
- Pin the OpenAPI converter to `@canonical/launchpad-openapi@0.0.6` and refresh
  both environment snapshots with their actual converter provenance.

### Fixed

- Preserve upstream response nullability, including `bug_task.package_type`.
- Accept file metadata arrays from `binaryFileUrls` and `sourceFileUrls` when
  `include_meta=true`, alongside the default URL arrays and empty arrays.
- Exclude verbatim OpenAPI snapshots from formatting to preserve their hashes.

The pending server-side binary package summary, description, and source-scoped
name filter changes are not included in these snapshots.
