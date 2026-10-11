// Compile-only consumers of the published declarations; never execute this file.
// Check client-owned inference rules against generated contracts, not a second
// hand-maintained description of Launchpad resource fields.
import {
  createLaunchpadClient,
  type LaunchpadClient,
  type LaunchpadCollection,
  type LaunchpadResource,
  type LaunchpadResponse,
} from "@canonical/launchpad-typescript-client";
import type {
  Input,
  OperationId,
  Output,
} from "@canonical/launchpad-typescript-client/contracts";
import type { Output as QaOutput } from "@canonical/launchpad-typescript-client/contracts/qastaging";
import {
  launchpadCollectionSchema,
  launchpadResourceSchema,
} from "@canonical/launchpad-typescript-client/schemas/primitives";
import { zProjectGetPath } from "@canonical/launchpad-typescript-client/schemas/operations/project";
import { z } from "zod";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Data<R extends Promise<LaunchpadResponse<unknown>>> = Awaited<R>["data"];
declare function expectType<T extends true>(): T;

const client: LaunchpadClient = createLaunchpadClient();

// Universal rule: an operation selects its generated output; a decoder overrides
// it. This stays valid as operation names, inputs, and response fields evolve.
export function checkOperationInference<K extends OperationId>(
  operation: K,
  input: Input<K>,
): void {
  const plain = client.request(operation, input);
  const withOptions = client.request(operation, input, { headers: {} });
  const decoded = client.request(operation, input, { decode: String });
  expectType<Equal<Data<typeof plain>, Output<K>>>();
  expectType<Equal<Data<typeof withOptions>, Output<K>>>();
  expectType<Equal<Data<typeof decoded>, string>>();
}

// One real operation checks concrete call-site inference and schema/package wiring.
// Expected input/output shapes still come from the generated contract.
const projectPath = zProjectGetPath.parse({ project: "launchpad" });
const validated = client.project.get({ path: projectPath });
const absolute = client.request("project.get", {
  resourceUrl: "https://api.launchpad.net/devel/launchpad",
});
expectType<Equal<Data<typeof validated>, Output<"project.get">>>();
expectType<Equal<Data<typeof absolute>, Output<"project.get">>>();

// Collection/count responses depend on the supplied ws.show, not just the ID.
const sourcesOperation = "archive.distribution.getPublishedSources";
const archivePath = { distribution: "ubuntu", archive: "primary" };
type SourcesResponse = Output<typeof sourcesOperation>;
type SourcesPage = Exclude<SourcesResponse, number>;
const sourcePage = client.archive.distribution.getPublishedSources({
  path: archivePath,
});
const requestedPage = client.request(sourcesOperation, { path: archivePath });
const sourceCount = client.archive.distribution.getPublishedSources({
  path: archivePath,
  query: { "ws.show": "total_size" },
});
const requestedCount = client.request(
  sourcesOperation,
  { path: archivePath, query: { "ws.show": "total_size" } },
  { headers: {} },
);
expectType<Equal<Data<typeof sourcePage>, SourcesPage>>();
expectType<Equal<Data<typeof requestedPage>, SourcesPage>>();
expectType<Equal<Data<typeof sourceCount>, number>>();
expectType<Equal<Data<typeof requestedCount>, number>>();
const noPathPage = client.branches.getBranches({});
expectType<
  Equal<
    Data<typeof noPathPage>,
    Exclude<Output<"branches.getBranches">, number>
  >
>();
expectType<
  Equal<
    Output<typeof sourcesOperation, { path: typeof archivePath }>,
    SourcesPage
  >
>();
expectType<
  Equal<
    QaOutput<
      typeof sourcesOperation,
      { path: typeof archivePath; query: { "ws.show": "total_size" } }
    >,
    number
  >
>();

// Other literal values and omitted/undefined fields cannot select the count.
const otherPage = client.archive.distribution.getPublishedSources({
  path: archivePath,
  query: { "ws.show": "entries" },
});
const emptyQueryPage = client.request(sourcesOperation, {
  path: archivePath,
  query: {},
});
const undefinedShowPage = client.request(sourcesOperation, {
  path: archivePath,
  query: { "ws.show": undefined },
});
const undefinedQueryPage = client.request(sourcesOperation, {
  path: archivePath,
  query: undefined,
});
expectType<Equal<Data<typeof otherPage>, SourcesPage>>();
expectType<Equal<Data<typeof emptyQueryPage>, SourcesPage>>();
expectType<Equal<Data<typeof undefinedShowPage>, SourcesPage>>();
expectType<Equal<Data<typeof undefinedQueryPage>, SourcesPage>>();

// Widened strings, optional counts, and unions must retain both wire shapes.
declare const show: string;
declare const maybeShow: "total_size" | "entries";
declare const optionalCountQuery: { "ws.show"?: "total_size" };
declare const optionalPageQuery: { "ws.show"?: "entries" } | undefined;
declare const sourcesInput: Input<typeof sourcesOperation>;
declare const unionInput:
  | { path: typeof archivePath }
  | { path: typeof archivePath; query: { "ws.show": "total_size" } };
const unknownShow = client.archive.distribution.getPublishedSources({
  path: archivePath,
  query: { "ws.show": show },
});
const unionShow = client.request(sourcesOperation, {
  path: archivePath,
  query: { "ws.show": maybeShow },
});
const optionalCount = client.archive.distribution.getPublishedSources({
  path: archivePath,
  query: optionalCountQuery,
});
const optionalPage = client.request(sourcesOperation, {
  path: archivePath,
  query: optionalPageQuery,
});
const broadInput = client.request(sourcesOperation, sourcesInput);
const widenedInput = {
  path: archivePath,
  query: { "ws.show": "total_size" },
};
const widenedCount = client.request(sourcesOperation, widenedInput);
expectType<Equal<Data<typeof unknownShow>, SourcesResponse>>();
expectType<Equal<Data<typeof unionShow>, SourcesResponse>>();
expectType<Equal<Data<typeof optionalCount>, SourcesResponse>>();
expectType<Equal<Data<typeof optionalPage>, SourcesPage>>();
expectType<Equal<Data<typeof broadInput>, SourcesResponse>>();
expectType<Equal<Data<typeof widenedCount>, SourcesResponse>>();
const unionResponse =
  client.archive.distribution.getPublishedSources(unionInput);
expectType<Equal<Data<typeof unionResponse>, SourcesResponse>>();

const decodedCount = client.archive.distribution.getPublishedSources(
  { path: archivePath, query: { "ws.show": "total_size" } },
  { decode: String },
);
const decodedPage = client.request(
  sourcesOperation,
  { path: archivePath },
  { decode: () => ({ decoded: true }) },
);
expectType<Equal<Data<typeof decodedCount>, string>>();
expectType<Equal<Data<typeof decodedPage>, { decoded: boolean }>>();

// Select an undocumented-output category from the contract, not a named endpoint.
type UndocumentedOperation = {
  [K in OperationId]: unknown extends Output<K> ? K : never;
}[OperationId];
declare const undocumentedOperation: UndocumentedOperation;
declare const undocumentedInput: Input<UndocumentedOperation>;
const undocumented = client.request(undocumentedOperation, undocumentedInput);
expectType<Equal<Data<typeof undocumented>, unknown>>();

const raw = client.requestRaw({ path: "resource" });
const rawDecoded = client.requestRaw({ path: "resource" }, { decode: String });
expectType<Equal<Data<typeof raw>, unknown>>();
expectType<Equal<Data<typeof rawDecoded>, string>>();

const firstPage = { start: 0, entries: ["1"] };
const pages = client.pages(firstPage, { decodeEntry: Number });
const items = client.items(firstPage, { decodeEntry: Number });
const unknownPages = client.pages(firstPage);
const unknownItems = client.items(firstPage);
expectType<
  Equal<typeof pages, AsyncIterableIterator<LaunchpadCollection<number>>>
>();
expectType<Equal<typeof items, AsyncIterableIterator<number>>>();
expectType<
  Equal<
    typeof unknownPages,
    AsyncIterableIterator<LaunchpadCollection<unknown>>
  >
>();
expectType<Equal<typeof unknownItems, AsyncIterableIterator<unknown>>>();

const transformedCollection = launchpadCollectionSchema(
  z.string().transform((value) => value.length),
);
expectType<
  Equal<LaunchpadResource, z.output<typeof launchpadResourceSchema>>
>();
expectType<
  Equal<LaunchpadCollection<number>, z.output<typeof transformedCollection>>
>();

client.request(sourcesOperation, {
  path: archivePath,
  // @ts-expect-error Collection options must still satisfy the generated input.
  query: { "ws.show": 1 },
});
// @ts-expect-error Required collection path parameters are still required.
client.archive.distribution.getPublishedSources({
  query: { "ws.show": "total_size" },
});
// @ts-expect-error Arbitrary raw output types still require a decoder.
client.requestRaw<string>({ path: "resource" });
// @ts-expect-error Operation IDs remain a generated contract.
client.request("not-an-operation", {});
// @ts-expect-error An identifier must retain the generated path type.
client.project.get({ path: { project: 1 } });
// @ts-expect-error resourceUrl and path cannot be combined.
client.request("project.get", {
  path: projectPath,
  resourceUrl: "https://api.launchpad.net/devel/launchpad",
});
