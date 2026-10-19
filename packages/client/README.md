# Launchpad TypeScript client

Call the Launchpad API from TypeScript with typed requests and lazy pagination.
The client uses Fetch and supports anonymous, cookie, and OAuth1 authentication.

Requires Node.js 24 or newer. This is an ESM package.
It is still under development.

## Install

```sh
npm install @canonical/launchpad-client
```

## Make your first request

```ts
import { createLaunchpadClient } from "@canonical/launchpad-client";

const client = createLaunchpadClient();
const { data } = await client.project.get({
  path: { project: "launchpad" },
});
console.log(data.display_name);
```

Use your editor's completion to find operations and their inputs.
Each request returns `{ data, response }`. `data` is the parsed result.
`response` contains the HTTP status and headers. Its body has already been read.

You can also call an operation by its ID:

```ts
const input = { path: { project: "launchpad" } };
await client.project.get(input);
// Equivalent to:
await client.request("project.get", input);
```

The methods use Launchpad's operation names. Dots create nested methods;
multiword names stay intact. Fixed operation arguments, such as `ws.op`, cannot
be overridden.

## Choose an API server

Requests go to `https://api.launchpad.net/devel/` by default.
To use qastaging, set `baseUrl`:

```ts
const qastaging = createLaunchpadClient({
  baseUrl: "https://api.qastaging.launchpad.net/devel/",
});
```

Include the API version in `baseUrl`, not just the hostname.

The client uses qastaging contracts for its types and methods.
Some operations may not exist in production.
Changing `baseUrl` changes the destination, not the types.

## Read collections

Collection requests return a page. Pass its `data` to `client.items` to iterate
through entries across pages:

```ts
const path = { distribution: "ubuntu", archive: "primary" };
const page = await client.archive.distribution.getPublishedSources({ path });

for await (const entry of client.items(page.data)) {
  console.log(entry);
}
```

Use `client.pages(page.data)` if you need whole pages instead.
Both iterators follow `next_collection_link`. They fetch the next page only when
iteration reaches it. Breaking the loop does not fetch another page.
Malformed pages and link cycles are rejected.

Entries have type `unknown` unless you supply a `decodeEntry` function.
It runs on the first page and every later page. Its errors pass through unchanged.

To request a count instead of a page, pass the literal `"total_size"`:

```ts
const count = await client.request("archive.distribution.getPublishedSources", {
  path,
  query: { "ws.show": "total_size" },
});
const total: number = count.data;
```

Omit `ws.show` to get a page. A value that might be `"total_size"` produces a
page-or-number type. Pagination does not request totals automatically.

## Validate responses

Typed requests do not validate responses at runtime. Undocumented outputs stay
`unknown`. To validate a response, pass a `decode` function:

```ts
import { zProjectGetResponse } from "@canonical/launchpad-client/schemas/operations/project";

const project = await client.project.get(
  { path: { project: "launchpad" } },
  { decode: zProjectGetResponse.parse },
);
console.log(project.data.display_name);
```

A decoder can validate or transform the result. Its return type becomes the type
of `data`. Importing the client alone does not load Zod.

Schema imports default to qastaging. For production, use
`@canonical/launchpad-client/schemas/production/operations/project`.
Explicit qastaging imports use `/schemas/qastaging/operations/project`.
Resource schemas live under `/schemas/models/`, with the same environment choices.

You can import operation types from the package root or `/contracts`.
Environment-specific contracts are available at `/contracts/production` and
`/contracts/qastaging`.

## Authenticate requests

Requests are anonymous by default. For runtime-managed cookies:

```ts
const cookieClient = createLaunchpadClient({
  auth: { type: "cookie" },
});
```

Cookie mode does not create a cookie jar in Node.js.

For OAuth1, pass `auth: { type: "oauth1", signer }`.
Your signer receives the serialized `Request`. It returns an `Authorization`
header value, either directly or as a promise. The client calls it once per
request, including pagination requests. It does not sign redirects again.

The client does not retry requests or refresh credentials automatically.
You can supply a custom Fetch implementation through the `fetch` option.
Native browser Fetch needs no manual binding.

## Make raw requests

Use `requestRaw` to call an API-relative path without an operation contract:

```ts
const { data: rawData, response } = await client.requestRaw({
  path: "launchpad",
});
console.log(response.status);
```

Raw data has type `unknown` unless you pass `decode` as a request option.
You can use an absolute `resourceUrl` instead of `path`, but not both.
Typed operations also accept `resourceUrl` instead of path parameters.

Request URLs must stay within the configured API origin and path prefix.
Fetch follows redirects, but the client does not check their destinations.

For request bodies, choose `body.encoding`: `"json"`, `"form"`, or `"native"`.
Put the body in `body.value`. Native Fetch bodies support binary uploads.
Responses are parsed as JSON or UTF-8 text. Binary response bytes are not preserved.

Query fields replace matching parameters in the URL. `undefined` leaves them unchanged.
Query and form arrays use JSON encoding. Scalar numbers must be finite.

## Handle errors and cancellation

Import these errors from `@canonical/launchpad-client`:

- `LaunchpadApiError`: an HTTP error. Read `status`, `headers`, and `body` for details.
- `LaunchpadDecodeError`: a successful HTTP response that failed JSON parsing or your response decoder.
  Read `cause` for the original error.

Network and abort errors pass through unchanged.
Pass an `AbortSignal` as `signal` in request or pagination options to cancel work.
