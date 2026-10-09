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
const validated = client.request("project-get", { path: projectPath });
const absolute = client.request("project-get", {
  resourceUrl: "https://api.launchpad.net/devel/launchpad",
});
expectType<Equal<Data<typeof validated>, Output<"project-get">>>();
expectType<Equal<Data<typeof absolute>, Output<"project-get">>>();

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

const transformedCollection = launchpadCollectionSchema(
  z.string().transform((value) => value.length),
);
expectType<
  Equal<LaunchpadResource, z.output<typeof launchpadResourceSchema>>
>();
expectType<
  Equal<LaunchpadCollection<number>, z.output<typeof transformedCollection>>
>();

// @ts-expect-error Arbitrary raw output types still require a decoder.
client.requestRaw<string>({ path: "resource" });
// @ts-expect-error Operation IDs remain a generated contract.
client.request("not-an-operation", {});
// @ts-expect-error An identifier must retain the generated path type.
client.request("project-get", { path: { project: 1 } });
// @ts-expect-error resourceUrl and path cannot be combined.
client.request("project-get", {
  path: projectPath,
  resourceUrl: "https://api.launchpad.net/devel/launchpad",
});
