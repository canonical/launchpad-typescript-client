# Launchpad TypeScript client

Requires Node.js 24 or newer. This library is under development and has not been
published yet.

## Development

From the repository root:

```sh
pnpm install --frozen-lockfile
npm --prefix packages/client/tooling ci --ignore-scripts
pnpm --dir packages/client generate
pnpm --dir packages/client build
pnpm --dir packages/client test:coverage
pnpm --dir packages/client typecheck
pnpm --dir packages/client check
```

The tooling package has a separate npm lockfile and pinned TypeScript compiler.
Its TypeScript scripts run with Node's native type stripping; `typecheck` also
checks those scripts explicitly. Vitest runs source tests, while subprocesses
exercise the real tooling and built package exports. See the
[generation workflow](tooling/README.md) for how snapshot provenance,
generator adaptation, and output validation fit together.

## Typed operation requests

```ts
import { createLaunchpadClient } from "@canonical/launchpad-typescript-client";

const client = createLaunchpadClient();
const { data } = await client.project.get({
  path: { project: "launchpad" },
});
console.log(data.display_name);
```

Operation IDs are imported unchanged from the upstream snapshot. Dotted IDs
also expose nested methods with the same inputs, options, decoder inference,
and response wrapper as `request`:

```ts
const input = { path: { project: "launchpad" } };
await client.project.get(input);
// Equivalent to:
await client.request("project.get", input);
```

Only dots declared in an upstream ID define this hierarchy; multiword components
stay intact. Generation rejects operation/namespace conflicts such as
`account.get` alongside `account.get.details`, and subjects that would replace
`request`, `requestRaw`, `pages`, or `items`.

The snapshots follow the
[namespace-first convention](../../docs/adr/0001-namespace-first-naming-paths.md),
including inherited contexts such as `accessToken.gitRepository.sourcePackage.get`.
No names or namespaces are guessed by the client. URL segments, field names, and
wire operation values still come from upstream metadata: `projects.newProject`
sends `ws.op=new_project`.

Generated operation IDs select input and documented output types. These types do
not validate responses; supplying `decode` explicitly validates or transforms the
result and overrides its inferred type. Undocumented outputs remain unknown.

Collection operations accept the optional literal `ws.show: "total_size"`.
Omitting it or passing undefined infers a page; the literal infers a number.
An optional count selection retains the union. Other values and widened strings
do not satisfy the generated input types. This applies to nested methods and
`request`; an explicit decoder still overrides the inferred output. `Output<K>`
retains the full wire union, while `Output<K, typeof input>` can select the output
for a particular input.

```ts
const path = { distribution: "ubuntu", archive: "primary" };
const page = await client.archive.distribution.getPublishedSources({ path });
console.log(page.data.entries);
const count = await client.request("archive.distribution.getPublishedSources", {
  path,
  query: { "ws.show": "total_size" },
});
const total: number = count.data;
```

The root dispatcher uses production contracts. Changing `baseUrl` changes the
transport destination, not its TypeScript contract. For qastaging-only contracts,
use `requestRaw` with an explicit qastaging decoder. Paths and absolute resource
URLs are alternative ways to address an operation; they cannot be combined.
Fixed operation query arguments cannot be overridden.

## Raw requests

```ts
import { createLaunchpadClient } from "@canonical/launchpad-typescript-client";

const client = createLaunchpadClient();
const { data, response } = await client.requestRaw({ path: "launchpad" });
// data is unknown until an explicit decoder is supplied.
console.log(response.status);
```

`baseUrl` is the complete API prefix, not just an origin. Initial relative paths
and absolute resource links must stay within its origin and prefix. Fetch follows
redirects; redirected destinations are not checked against that boundary.
Bodies use explicit JSON, form, or native Fetch encoding. Responses retain status
and headers, but their bodies have already been consumed.

Supplied query fields replace matching parameters in the target URL. Undefined
fields leave existing parameters unchanged. Query/form scalar numbers must be
finite; arrays retain JSON encoding.

Responses are decoded as JSON or UTF-8 text. Binary response bodies are not
preserved; an opt-in byte-preserving response mode is deferred. Native Fetch
bodies can still upload binary data without text conversion.

Authentication defaults to anonymous. Cookie mode delegates cookie handling to
the runtime; it does not create a Node cookie jar. OAuth1 uses a caller-supplied
signer once after serialization of the initial request, not for redirected
requests. Fetch is injectable and invoked without a receiver, so native browser
Fetch needs no manual binding. Network and abort failures propagate unchanged;
HTTP and successful-response decoding failures have distinct error classes.
No automatic retries or credential refresh are performed.

## Lazy pagination

Pass collection `data`, not the `{ data, response }` wrapper, to `client.pages`
or `client.items`. Both follow `next_collection_link` through the same transport
and confinement checks. They reject malformed envelopes and link cycles, and
fetch another page only when iteration advances past the current one.

Entries remain unknown unless `decodeEntry` is supplied. That decoder applies
to the first page and every subsequent page; its failures propagate unchanged.
Breaking iteration does not prefetch another page. No offsets are synthesized
and no total-size links are fetched automatically.

## Generate contracts offline

`generate` consumes the saved snapshots without network requests. It generates
production and qastaging in separate processes and rejects stale provenance
hashes. All derived artifacts are ignored by Git under `src/generated/`; run
`generate` before building a clean checkout or after changing a snapshot.

The generator stays on TypeScript 6.0.3 because the pinned Hey API version is not
compatible with TypeScript 7 at runtime. The workspace compiler can still check
the generated output. Contracts retain upstream operation IDs and unknown types;
no client-side field corrections or response coercion are applied. Generation
rejects duplicate operation IDs and generated-name collisions with both source
definitions, rather than silently assigning numeric suffixes.

Contract and schema export paths have production aliases and explicit
`production`/`qastaging` variants. Import schemas separately when runtime
validation is required. The root exports types without loading Zod at runtime.
Schema modules also export inferred types with validator-neutral names, such as
`PersonFull`, `PersonDiff`, and `PersonPage`. Operation types include role suffixes
such as `ProjectGetPath` and `ProjectGetResponse`. Runtime schema names use a `z`
prefix, for example `zPersonFull`.

## Refresh snapshots explicitly

Refreshing invokes the upstream converter and may access the network. It is not
part of the build or test workflow. From this package directory:

```sh
pnpm schema:update
# Limit a refresh to one environment:
pnpm schema:update --environment qastaging
# Explicitly select a local upstream checkout instead:
pnpm schema:update --converter /path/to/launchpad-openapi
```

By default, refresh uses the npm-published converter pinned in
`tooling/package.json`. `--converter` explicitly selects a local upstream checkout.
Production and qastaging outputs are imported verbatim, with the converter version
and source hash recorded for each snapshot. See [snapshot provenance](schema/README.md).
