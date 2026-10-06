# Launchpad TypeScript client

Requires Node.js 24 or newer. From the repository root:

```sh
pnpm install --frozen-lockfile
npm --prefix packages/client/tooling ci --ignore-scripts
pnpm --dir packages/client build
pnpm --dir packages/client test:coverage
pnpm --dir packages/client typecheck
pnpm --dir packages/client check
```

The tooling package has a separate npm lockfile and pinned TypeScript compiler.
Its TypeScript scripts run with Node's native type stripping; `typecheck` also
checks those scripts explicitly. Vitest runs source tests, while subprocesses
exercise the real tooling and built package exports.

## Refresh snapshots explicitly

Refreshing invokes the upstream converter and may access the network. It is not
part of the build or test workflow. From this package directory:

```sh
pnpm schema:update -- --converter /path/to/launchpad-openapi
# Limit a refresh to one environment:
pnpm schema:update -- --environment qastaging --converter /path/to/launchpad-openapi
```

Without `--converter`, refresh uses the pinned registry converter 0.0.2. That
version predates the checked-in snapshots' semantic operation IDs; use the
appropriate local upstream converter to preserve them. See
[snapshot provenance](schema/README.md) before refreshing. Production and
qastaging outputs are imported verbatim and each receives its own source hash.
