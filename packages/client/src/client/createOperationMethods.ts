import type { OperationPathNamespace } from "../generated/production/operations.js";
import type {
  Input,
  OperationId,
  Output,
} from "../generated/production/contracts.js";
import type {
  BoundOperationPaths,
  LaunchpadClient,
  LaunchpadDecodeOptions,
  LaunchpadOperationMethod,
  LaunchpadRequestOptions,
  LaunchpadResponse,
  RequestSettings,
} from "../types.js";

/**
 * Bind the generated naming hierarchy to the existing request dispatcher.
 *
 * Every leaf retains its upstream ID, input contract, and decoder overload.
 * Namespace objects have no prototype so names such as constructor and toString
 * remain ordinary source-defined components. No URL or wire value is inferred
 * from a naming path.
 */
export default function createOperationMethods<
  const Paths extends OperationPathNamespace,
>(
  request: LaunchpadClient["request"],
  paths: Paths,
): BoundOperationPaths<Paths> {
  function bindOperation<K extends OperationId>(
    operationId: K,
  ): LaunchpadOperationMethod<K> {
    function invoke<T>(
      input: Input<K>,
      settings: LaunchpadDecodeOptions<T>,
    ): Promise<LaunchpadResponse<T>>;
    function invoke(
      input: Input<K>,
      settings?: LaunchpadRequestOptions,
    ): Promise<LaunchpadResponse<Output<K>>>;
    function invoke(
      input: Input<K>,
      settings?: RequestSettings,
    ): Promise<LaunchpadResponse<unknown>> {
      return request(operationId, input, settings);
    }
    return invoke;
  }

  function bindNamespace(
    namespacePaths: OperationPathNamespace,
  ): Record<string, unknown> {
    const methods: Record<string, unknown> = Object.create(null);
    for (const [part, path] of Object.entries(namespacePaths)) {
      methods[part] =
        typeof path === "string" ? bindOperation(path) : bindNamespace(path);
    }
    return methods;
  }

  // Generation checks the tree; binding replaces each ID with its typed method.
  return bindNamespace(paths) as BoundOperationPaths<Paths>;
}
