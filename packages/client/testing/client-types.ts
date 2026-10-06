// Compile-only consumers of the published declarations; never execute this file.
import {
  createLaunchpadClient,
  type LaunchpadClient,
  type LaunchpadCollection,
  type LaunchpadResource,
  type LaunchpadResponse,
} from "@canonical/launchpad-typescript-client";
import {
  launchpadCollectionSchema,
  launchpadResourceSchema,
} from "@canonical/launchpad-typescript-client/schemas/primitives";
import { z } from "zod";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Data<R extends Promise<LaunchpadResponse<unknown>>> = Awaited<R>["data"];
declare function expectType<T extends true>(): T;

const client: LaunchpadClient = createLaunchpadClient();
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
