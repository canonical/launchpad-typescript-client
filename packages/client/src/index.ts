/*
 * Copyright 2026 Canonical Ltd.  This software is licensed under the
 * GNU Lesser General Public License version 3 (see the file LICENSE).
 */

/**
 * Type-only resource and operation contracts; schemas are separate opt-in imports.
 * @module launchpad-typescript-client
 */
export type {
  Operations,
  OperationId,
  Input,
  Output,
} from "./generated/production/contracts.js";
export type {
  LaunchpadResource,
  LaunchpadCollection,
} from "./schemas/primitives.js";
