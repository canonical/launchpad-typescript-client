/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Fetch client, HTTP errors, and type-only contracts; schemas are separate opt-in imports.
 * @module launchpad-typescript-client
 */
export { createLaunchpadClient } from "./client/createLaunchpadClient.js";
export type {
  LaunchpadClient,
  LaunchpadOperationMethod,
  LaunchpadOperationMethods,
  LaunchpadClientOptions,
  LaunchpadAuth,
  LaunchpadFieldValue,
  LaunchpadFields,
  LaunchpadRawBody,
  LaunchpadRawRequest,
  LaunchpadRequestOptions,
  LaunchpadDecodeOptions,
  LaunchpadPaginationOptions,
  LaunchpadDecodedPaginationOptions,
  LaunchpadResponse,
} from "./types.js";
export { LaunchpadApiError, LaunchpadDecodeError } from "./errors.js";
export type {
  Operations,
  OperationId,
  Input,
  Output,
} from "./generated/qastaging/contracts.js";
export type {
  LaunchpadResource,
  LaunchpadCollection,
} from "./schemas/primitives.js";
