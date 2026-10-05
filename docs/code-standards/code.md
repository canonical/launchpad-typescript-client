# Code Standards

Standards for code development.

## cs:code.api.stability

Experimental APIs must be marked with the @experimental JSDoc tag in type definition files. The tag must include a description of what is experimental.

### Do

Mark an experimental interface with a clear @experimental JSDoc tag and description.
```typescript
/**
 * Configuration for the data processing pipeline.
 * @experimental The streaming API is experimental and may change
 * in future releases. Currently, it only supports JSON data.
 */
interface PipelineConfig {
  // ...
}
```

Add an @experimental tag to a specific property with context about its experimental status.
```typescript
interface PipelineConfig {
  /**
   * @experimental The custom transformers API is in beta, and the interface
   * may change to support stronger type validation.
   */
  transformers?: DataTransformer[];
}
```

Describe the experimental status and any future plans for the API.
```typescript
interface CacheConfig {
  /**
   * @experimental The distributed cache API is experimental and will be
   * replaced with a new consensus-based implementation in v2.1.
   */
  distributed?: boolean;
}
```

### Don't

Use the @experimental tag without an explanation.
```typescript
interface ProcessorConfig {
  /** @experimental */ // Bad: No context provided.
  streaming?: boolean;
}
```

Use the @experimental tag without describing what is experimental.
```typescript
/**
 * @experimental // Bad: No description of what is experimental.
 */
interface QueueConfig {
  processor: (item: any) => Promise<void>;
}
```

---

## cs:code.constants.file

Domain constants must be collected in a `constants.ts` file using named exports (no default export). The file must be colocated at the level of the domain that owns the constants — inside the domain folder when one exists. Constants files always use named exports so consumers can import exactly what they need. Single-use constants that are only referenced in one file may be declared inline in that file instead of being extracted to `constants.ts`.

### Do

Create a `constants.ts` file with named exports at the domain level
```typescript
// features/pricing/constants.ts
export const DEFAULT_CURRENCY = "USD";
export const TAX_RATE = 0.21;
export const MAX_DISCOUNT_PERCENT = 50;
```

Colocate `constants.ts` inside the domain folder it belongs to
```
features/
├── pricing/
│   ├── constants.ts          # Domain constants live here
│   ├── calculatePrice.ts
│   └── index.ts
├── auth/
│   ├── constants.ts          # Auth-specific constants
│   ├── validateToken.ts
│   └── index.ts
```

Import constants directly from the owning domain's `constants.ts`
```typescript
// features/pricing/calculatePrice.ts
import { TAX_RATE, DEFAULT_CURRENCY } from "./constants.js";
```

Keep all exports in `constants.ts` as named exports with the same shape (plain values)
```typescript
// constants.ts
export const RECONNECT_INTERVAL_MS = 5000;
export const MAX_RETRIES = 3;
export const DEFAULT_TIMEOUT_MS = 30_000;
```

Keep single-use constants inline in the file that uses them
```typescript
// features/pricing/applyDiscount.ts
const MAX_DISCOUNT_PERCENT = 50;

export default function applyDiscount(price: number, rate: number): number {
  const capped = Math.min(rate, MAX_DISCOUNT_PERCENT / 100);
  return price * (1 - capped);
}
```

### Don't

Use a default export in a constants file
```typescript
// Bad: default export forces consumers to name the import
export default {
  DEFAULT_CURRENCY: "USD",
  TAX_RATE: 0.21,
};
```

Scatter constants across unrelated files instead of collecting them in `constants.ts`
```typescript
// Bad: constants buried inside implementation files
// calculatePrice.ts
export const TAX_RATE = 0.21;
const calculatePrice = (base: number) => base * (1 + TAX_RATE);
export default calculatePrice;
```

Place constants far from the domain that owns them
```typescript
// Bad: pricing constants in a top-level shared file
// src/constants.ts
export const TAX_RATE = 0.21;        // Belongs in pricing/
export const MAX_RETRIES = 3;        // Belongs in network/
export const SESSION_TTL_MS = 3600;  // Belongs in auth/
```

Mix constants with functions, types, or other non-constant exports
```typescript
// Bad: constants.ts should only contain constant values
export const MAX_RETRIES = 3;
export const formatRetryMessage = (n: number) => `Retry ${n} of ${MAX_RETRIES}`;
export type RetryConfig = { max: number };
```

---

## cs:code.schemas.file

Validation schemas (zod) must live in a `schemas.ts` file using named exports, colocated at the level of the domain that owns them — inside the domain folder when one exists. Types derived from a schema must be declared next to the schema via `z.infer`/`z.output`, never hand-written as a duplicate interface that can drift. Output shapes belong in the schema itself (defaults, coercions, `.transform()`), not in post-processing by hand. Single-use schemas that are only referenced in one file may be declared inline in that file instead of being extracted to `schemas.ts`.

### Do

Create a `schemas.ts` file with the schema and its inferred type together
```typescript
// features/pricing/schemas.ts
import { z } from "zod";

export const schema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
});

/** A validated price. */
export type Price = z.infer<typeof schema>;
```

Colocate `schemas.ts` inside the domain folder it belongs to
```
features/
├── pricing/
│   ├── schemas.ts            # Domain schemas live here
│   ├── constants.ts
│   ├── calculatePrice.ts
│   └── index.ts
├── auth/
│   ├── schemas.ts            # Auth-specific schemas
│   ├── validateToken.ts
│   └── index.ts
```

Derive output shapes inside the schema instead of post-processing parsed data
```typescript
// features/pricing/schemas.ts
export const schema = z
  .object({
    amount: z.coerce.number().positive(),
    currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  })
  .transform((data) => ({
    ...data,
    label: `${data.amount} ${data.currency}`,
  }));

export type Price = z.output<typeof schema>;
```

Keep single-use schemas inline in the file that uses them
```typescript
// features/auth/parseCallback.ts
const callbackSchema = z.object({ code: z.string().min(1) });

export default function parseCallback(query: unknown): string {
  return callbackSchema.parse(query).code;
}
```

### Don't

Hand-write an interface that duplicates a schema's shape
```typescript
// Bad: the interface drifts silently when the schema changes
export interface Price {
  amount: number;
  currency: string;
}
export const schema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
});
```

Bury a shared schema inside an implementation file
```typescript
// Bad: schema hidden mid-file in a loader consumed elsewhere
// features/pricing/loadPrice.ts
const schema = z.object({ amount: z.coerce.number().positive() });

export default function loadPrice(raw: unknown) {
  return schema.parse(raw);
}
```

Declare the inferred type far from its schema
```typescript
// Bad: type in types.ts, schema in schemas.ts — the pairing is invisible
// features/pricing/types.ts
export type Price = z.infer<typeof schema>;
```

Assemble the output shape by hand after parsing
```typescript
// Bad: the schema no longer describes the real output
const parsed = schema.parse(raw);
return { ...parsed, label: `${parsed.amount} ${parsed.currency}` };
```

---

## cs:code.errors.file

`better-result` `TaggedError` subclasses must live in an `errors.ts` file using named exports, colocated at the level of the domain that owns them — inside the domain folder when one exists. A domain collects all of its errors in that single `errors.ts`; do not create one file per error class (no `FooError.ts`, `BarError.ts`). Each domain owns its errors: wrap lower-level failures into a domain error rather than throwing across boundaries. Consumers import a domain's errors through its public entry point (e.g. the domain's `index.ts`), which re-exports from `errors.ts`. Single-use errors that are only referenced in one file may be declared inline in that file instead of being extracted to `errors.ts`.

### Do

Create an `errors.ts` file with named `TaggedError` exports at the domain level
```typescript
// features/pricing/errors.ts
import { TaggedError } from "better-result";

/** Raised when a price fails validation. `issues` lists each problem. */
export class PriceError extends TaggedError("PriceError")<{
  message: string;
  issues: readonly string[];
}>() {}
```

Collect every error a domain owns in the same `errors.ts`
```typescript
// features/pricing/errors.ts
import { TaggedError } from "better-result";

/** Raised when a discount cannot be applied. `cause` carries the source. */
export class DiscountError extends TaggedError("DiscountError")<{
  message: string;
  cause: unknown;
}>() {}

/** Raised when a currency conversion has no available rate. */
export class ConversionError extends TaggedError("ConversionError")<{
  message: string;
  cause: unknown;
}>() {}
```

Colocate `errors.ts` inside the domain folder it belongs to
```
features/
├── pricing/
│   ├── errors.ts             # Domain errors live here
│   ├── schemas.ts
│   ├── constants.ts
│   ├── calculatePrice.ts
│   └── index.ts
├── auth/
│   ├── errors.ts             # Auth-specific errors
│   ├── validateToken.ts
│   └── index.ts
```

Re-export the domain's errors through its entry point and import from there
```typescript
// features/pricing/index.ts
export { PriceError, DiscountError } from "./errors.js";

// features/checkout/applyPromo.ts
import { DiscountError } from "#pricing";
```

Keep single-use errors inline in the file that uses them
```typescript
// features/auth/parseCallback.ts
class CallbackError extends TaggedError("CallbackError")<{ message: string }>() {}
```

### Don't

Create one file per error class
```
// Bad: an error per file scatters the domain's failures
features/pricing/
├── PriceError.ts
├── DiscountError.ts
└── ConversionError.ts
```

Name the errors file after a single error class
```typescript
// Bad: features/pricing/PriceError.ts — should be errors.ts
export class PriceError extends TaggedError("PriceError")<{
  message: string;
}>() {}
```

Mix errors with functions, schemas, or other non-error exports
```typescript
// Bad: errors.ts should only contain TaggedError subclasses
export class PriceError extends TaggedError("PriceError")<{ message: string }>() {}
export const formatPrice = (n: number) => `$${n}`;
export const schema = z.object({ amount: z.number() });
```

Throw a raw error across a domain boundary instead of returning a domain error
```typescript
// Bad: callers can't type or match on the failure
export default function calculatePrice(raw: unknown): number {
  if (typeof raw !== "number") throw new Error("not a number");
  return raw * TAX_RATE;
}
```

---

## cs:code.function.composition

Each function must handle exactly one specific task. Complex operations must be broken down into smaller, single-purpose functions.

### Do

Define functions with a single, clear responsibility.
```typescript
const validateEmail = (email: string): boolean => {
  return /^[^@]+@[^@]+\\.[^@]+$/.test(email);
};
```

Compose single-purpose functions to build complex logic.
```typescript
const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

const validateForm = (email: string, password:string): boolean => {
  return validateEmail(email) && validatePassword(password);
};
```

### Don't

Mix multiple responsibilities in a single function.
```typescript
const processUserData = (user: any) => {
  // Validates user data
  // Transforms the data
  // Saves to the database
  // Sends a notification
};
```

---

## cs:code.function.location

Functions must be defined as close to their broadest point of use as possible. Shared utilities must be placed in a common location, and each function must serve a single feature or responsibility.

### Do

Place functions in the file or module where they are most broadly used. If a function is shared across multiple components or modules, place it in a common utility location.
```typescript
// utils/math.ts
export function calculateSum(a: number, b: number): number {
  return a + b;
}

// Used in multiple places
import { calculateSum } from './utils/math.js';

// For single-use functions, keep them close to their usage:
```

### Don't

Place functions far from where they are used, or in a generic location if only used in one place.
```typescript
// utils/validators.ts
export const validateUser = (user: User) => { ... }; // Only used in one component

// services/UserService.ts
import { validateUser } from '../utils/validators.js'; // Less ideal if only used here

// Don't mix unrelated functions in a single file:
```

---

## cs:code.function.purity

Functions should be pure where possible. A pure function returns the same output for the same input and does not modify external state or perform I/O operations. If a function must perform side effects (e.g., I/O in CLI tools), it must be explicitly annotated and documented with the reason for impurity using the @note tag in TSDoc/JSDoc.

### Do

Create pure functions that rely only on their inputs to compute the output.
```typescript
const calculatePrice = (basePrice: number, taxRate: number): number => {
  return basePrice * (1 + taxRate);
};
```


### Don't

Create impure functions without annotation or documentation.
```typescript
let total = 0;
const addToTotal = (value: number) => {
  total += value; // Modifies external state, not documented
};
```

---

## cs:code.module.clusters

A domain folder's root may contain only the barrel (`index.ts`) and the standard files (`constants.ts`, `errors.ts`, `schemas.ts`, `types.ts`). Implementation files live in cluster folders: a short-noun-named subdirectory grouping one capability — its public entry file(s) plus the helpers only they use (the file-level extension of `cs:code.function.location`). Domains with six or fewer implementation files may stay flat. Clusters do not get their own barrels or standard files: the domain `index.ts` remains the single public surface and imports directly from cluster paths, and the domain-level standard files stay authoritative. Tests live next to the file they test and move with it. A helper needed by two clusters signals it is its own capability — promote it to its own cluster rather than creating a `shared/` folder.

### Do

Group implementation files into capability-named cluster folders, keeping standard files at the domain root
```
operations/
├── index.ts              # Domain barrel — the single public surface
├── constants.ts
├── types.ts
├── seq/                  # Capability: replication sequence handling
│   ├── parseUpdateSeq.ts
│   ├── parseUpdateSeq.test.ts
│   └── computeSeqLag.ts
└── fetch/                # Capability: packument fetching
    ├── fetchPackument.ts
    └── drainQueue.ts
```

Import cluster files directly from the domain barrel — no sub-barrels
```typescript
// operations/index.ts
export { default as parseUpdateSeq } from "./seq/parseUpdateSeq.js";
export { default as fetchPackument } from "./fetch/fetchPackument.js";
```

Place a helper in the cluster of its only consumer
```
resolve/
├── resolveTree.ts        # Public entry, exported via domain barrel
└── selectVersion.ts      # Helper only resolveTree uses — lives beside it
```

Promote a helper used by two clusters into its own cluster
```
http/
├── client/createRegistryClient.ts   # uses classifyResponse
├── backoff/computeBackoff.ts        # also uses classifyResponse
└── classify/classifyResponse.ts     # shared by two capabilities → own cluster
```

### Don't

Leave a large domain flat, forcing navigation by filename recall
```
operations/
├── buildFailedWrite.ts
├── collectAllDocsRows.ts
├── collectChangesRows.ts
├── computeSeqLag.ts
├── drainQueue.ts
├── fetchPackument.ts
├── isSeqRegression.ts
├── leadingSeqInt.ts
├── parseUpdateSeq.ts
├── processChangesPage.ts
├── revalidatePackument.ts
├── walkAllDocs.ts
└── withSeq.ts            # 13 siblings, no visible grouping
```

Give clusters their own barrels or standard files
```
operations/
└── seq/
    ├── index.ts          # Bad: sub-barrel — domain index.ts is the only barrel
    ├── constants.ts      # Bad: constants belong in operations/constants.ts
    └── parseUpdateSeq.ts
```

Create a `shared/` dumping ground for cross-cluster helpers
```
operations/
├── seq/…
├── fetch/…
└── shared/               # Bad: "shared" names no capability — promote the
    └── leadingSeqInt.ts  # helper to its own cluster instead
```

Nest clusters inside clusters
```
operations/
└── fetch/
    └── retry/            # Bad: one level of clustering only — split the
        └── computeBackoff.ts   # domain instead if it grows this deep
```

---

## cs:code.naming.function_verb

All function and method names must start with a verb that describes the action the function performs. Names like `pathToX` or `dataForUser` describe a result, not an action — use `findPathToX` or `fetchDataForUser` instead. This makes the function's intent immediately clear and distinguishes functions from plain values or constants.

### Do

Start function names with an action verb
```typescript
const findPathToModule = (name: string): string => { /* ... */ };
const fetchDataForUser = (userId: string): Promise<User> => { /* ... */ };
const parseConfigFile = (path: string): Config => { /* ... */ };
const calculateTotalPrice = (items: Item[]): number => { /* ... */ };
const isValidEmail = (email: string): boolean => { /* ... */ };
const hasPermission = (user: User, action: string): boolean => { /* ... */ };
```

Use descriptive verb prefixes that convey the operation
```typescript
// Retrieval: get, fetch, find, resolve, load, read
const getUser = (id: string): User => { /* ... */ };
const fetchOrders = (): Promise<Order[]> => { /* ... */ };
const findMatchingRule = (rules: Rule[], input: string): Rule | undefined => { /* ... */ };

// Transformation: format, parse, convert, transform, map, normalize
const formatDate = (date: Date): string => { /* ... */ };
const parseResponse = (raw: string): Response => { /* ... */ };

// Validation: is, has, can, should, validate, check
const isActive = (user: User): boolean => { /* ... */ };
const hasExpired = (token: Token): boolean => { /* ... */ };
const validateInput = (data: unknown): data is FormData => { /* ... */ };

// Mutation: set, update, add, remove, delete, reset, clear
const setTheme = (theme: Theme): void => { /* ... */ };
const removeItem = (id: string): void => { /* ... */ };

// Creation: create, build, generate, compose, make
const createConnection = (config: Config): Connection => { /* ... */ };
const buildQuery = (params: Params): string => { /* ... */ };
```

### Don't

Name functions as nouns or noun phrases — they read like values, not actions
```typescript
// Bad: reads like a variable, not a function
const pathToModule = (name: string): string => { /* ... */ };
// Good: findPathToModule

const dataForUser = (userId: string): Promise<User> => { /* ... */ };
// Good: fetchDataForUser

const userPermissions = (user: User): Permission[] => { /* ... */ };
// Good: getPermissions or listPermissions
```

Use vague or non-descriptive verbs that don't convey meaning
```typescript
// Bad: "do" and "process" are too vague on their own
const doEmail = (email: string) => { /* ... */ };
// Good: sendEmail, validateEmail, formatEmail

const processUser = (user: User) => { /* ... */ };
// Good: activateUser, deactivateUser, updateUser
```

---

## cs:code.naming.intermediate_variables

Introduce a local variable when its name clarifies a non-obvious expression or condition, or when it avoids repeated work. Name the concept it represents: use precise nouns for values and predicates such as `is`, `has`, or `can` for booleans. Keep the declaration near its use and compute it only on paths that need it. Leave obvious one-use expressions inline.

### Do

Give a non-obvious condition a name that describes exactly what it checks
```typescript
if (format === "uri") {
  const hasScheme =
    candidate !== undefined && /^[a-z][a-z\d+.-]*:/i.test(candidate);
  if (!hasScheme) return undefined;
}
```

Name a calculated value when the name conveys its role
```typescript
const retryDelayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
await wait(retryDelayMs);
```

### Don't

Use a vague name or claim a check establishes more than it does
```typescript
// Bad: a scheme prefix alone does not prove the string is a valid URI.
const isValidUri = /^[a-z][a-z\d+.-]*:/i.test(candidate);
```

Introduce a variable for an obvious, one-use comparison
```typescript
// Bad: the name adds nothing to the expression.
const isEmpty = items.length === 0;
if (isEmpty) return;
// Good: if (items.length === 0) return;
```

---

## cs:code.types.file

Reusable domain types must be collected in a `types.ts` file using named exports (no default export), colocated at the level of the domain that owns them. Types that are only used in a single file may be declared inline in that file instead of being extracted to `types.ts`.

### Do

Create a `types.ts` file with named exports for types shared across the domain
```typescript
// features/pricing/types.ts
export type Currency = "USD" | "EUR" | "GBP";
export interface PriceBreakdown {
  base: number;
  tax: number;
  total: number;
}
export type DiscountStrategy = "percentage" | "fixed";
```

Colocate `types.ts` inside the domain folder it belongs to
```
features/
├── pricing/
│   ├── types.ts              # Shared domain types live here
│   ├── constants.ts
│   ├── calculatePrice.ts
│   └── index.ts
├── auth/
│   ├── types.ts              # Auth-specific types
│   ├── validateToken.ts
│   └── index.ts
```

Keep single-use types inline in the file that uses them
```typescript
// features/pricing/applyDiscount.ts
type DiscountResult = { discounted: number; savings: number };

export default function applyDiscount(price: number, rate: number): DiscountResult {
  const savings = price * rate;
  return { discounted: price - savings, savings };
}
```

Import shared types from the owning domain's `types.ts`
```typescript
// features/pricing/calculatePrice.ts
import type { Currency, PriceBreakdown } from "./types.js";
```

### Don't

Use a default export in a types file
```typescript
// Bad: default export for a collection of types
export default interface PriceBreakdown {
  base: number;
  tax: number;
  total: number;
}
```

Extract single-use types to `types.ts` when they are only used in one file
```typescript
// Bad: types.ts contains a type only used in applyDiscount.ts
// types.ts
export type DiscountResult = { discounted: number; savings: number };

// applyDiscount.ts
import type { DiscountResult } from "./types.js"; // Unnecessary indirection
```

Place types far from the domain that owns them
```typescript
// Bad: all types dumped in a top-level shared file
// src/types.ts
export type Currency = "USD" | "EUR" | "GBP";  // Belongs in pricing/
export type AuthToken = { jwt: string };         // Belongs in auth/
export type RetryPolicy = { max: number };       // Belongs in network/
```

Mix types with functions, constants, or other non-type exports
```typescript
// Bad: types.ts should only contain type declarations
export type Currency = "USD" | "EUR" | "GBP";
export const DEFAULT_CURRENCY: Currency = "USD";
export const formatCurrency = (value: number, currency: Currency) => `${currency} ${value}`;
```

---
