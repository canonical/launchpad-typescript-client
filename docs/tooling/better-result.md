================
LIBRARY RULES
================
- Use Result.gen with yield* for composing multiple Result-returning operations - enables railway-oriented programming
- Use Result.await to yield Promise<Result> in async generators - required for async operations inside Result.gen
- Extend TaggedError("YourError") for discriminated error types - creates errors with _tag for exhaustive matching
- Return Result.ok() or Result.err() at the end of Result.gen blocks - generators must return a Result
- Use Result.try with catch handler to convert exceptions to typed errors - wrap throwing functions safely
- Use Result.tryPromise for async ops with optional retry - supports times, delayMs, backoff, shouldRetry options
- For async retry decisions, enrich error in catch handler (can be async) then use shouldRetry synchronously
- Use .match({ ok, err }) for exhaustive handling of both Result variants - forces explicit error handling
- Use matchError for exhaustive pattern matching on TaggedError unions - compiler enforces all error variants
- Prefer unwrapOr over unwrap to provide fallback values - unwrap throws on Err
- All combinators support dual API: fn(result, arg) and fn(arg)(result) - both data-first and pipeable styles
- Chain .mapError() on Result.gen() output to normalize multiple error types into a single unified error type

================
CODE SNIPPETS
================
### Quick Start

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

A quick example demonstrating how to wrap throwing functions, check results, and use pattern matching.

```ts
import { Result } from "better-result";

// Wrap throwing functions
const parsed = Result.try(() => JSON.parse(input));

// Check and use
if (Result.isOk(parsed)) {
  console.log(parsed.value);
} else {
  console.error(parsed.error);
}

// Or use pattern matching
const message = parsed.match({
  ok: (data) => `Got: ${data.name}`,
  err: (e) => `Failed: ${e.message}`,
});
```

--------------------------------

### Install

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Install the better-result package using npm, Bun, or pnpm.

```sh
npm install better-result
bun add better-result
pnpm add better-result
```

--------------------------------

### Install skills globally without prompts

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Command to globally install the better-result adopt skill without prompts.

```sh
npx skills add dmmulroy/better-result@better-result-adopt -g -y
```

--------------------------------

### Install better-result for richer AI context

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Command to install better-result for richer AI context.

```sh
npx opensrc better-result
```

--------------------------------

### Install skills with skills.sh-compatible tooling

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Commands to add the better-result adopt and migrate-v2 skills using npx.

```sh
npx skills add dmmulroy/better-result@better-result-adopt
npx skills add dmmulroy/better-result@better-result-migrate-v2
```

--------------------------------

### Creating Results

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Examples of creating Result instances for success, error, from throwing functions, promises, and with custom error handling.

```ts
// Success
const ok = Result.ok(42);

// Error
const err = Result.err(new Error("failed"));

// From throwing function
const result = Result.try(() => riskyOperation());

// From promise
const result = await Result.tryPromise(() => fetch(url));

// With custom error handling
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
```

--------------------------------

### Observing Results - Async Tap

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Examples of asynchronous side effects using `tapErrorAsync` and `tapBothAsync`.

```ts
const result = await Result.err("request failed").tapErrorAsync(async (error) => {
  await trace("request.failed", { error });
});

const observed = await Result.tapBothAsync(
  Result.try(() => JSON.parse(input)),
  {
    ok: async (value) => {
      await trace("payload.decoded", { value });
    },
    err: async (error) => {
      await trace("payload.decode_failed", { error });
    },
  },
);
```

--------------------------------

### Panic Example

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Demonstrates how `Panic` is thrown when user callbacks or cleanup logic within Result operations encounter errors, and how to catch and identify `Panic` instances.

```typescript
import { Panic, isPanic } from "better-result";

// Callback throws → Panic
Result.ok(1).map(() => {
  throw new Error("bug");
}); // throws Panic

// Generator cleanup throws → Panic
Result.gen(function* () {
  try {
    yield* Result.err("expected failure");
  } finally {
    throw new Error("cleanup bug");
  }
}); // throws Panic

// Catch handler throws → Panic
Result.try({
  try: () => riskyOp(),
  catch: () => {
    throw new Error("bug in handler");
  },
}); // throws Panic

// Catching Panic (for error reporting)
try {
  result.map(() => {
    throw new Error("bug");
  });
} catch (error) {
  if (isPanic(error)) {
    // isPanic() is a type guard function
    console.error("Defect:", error.message, error.cause);
  }

  if (Panic.is(error)) {
    // Panic.is() is a static method (same behavior)
  }

  if (error instanceof Panic) {
    // instanceof works too
  }
}
```

--------------------------------

### UnhandledException Example

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Demonstrates how Result.try() and Result.tryPromise() handle exceptions without custom handlers, resulting in an UnhandledException type.

```typescript
import { Result, UnhandledException } from "better-result";

// Automatic — error type is UnhandledException
const result = Result.try(() => JSON.parse(input));
//    ^? Result<unknown, UnhandledException>

// Custom handler — you control the error type
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
//    ^? Result<unknown, ParseError>

// Same for async
await Result.tryPromise(() => fetch(url));
//    ^? Promise<Result<Response, UnhandledException>>
```

--------------------------------

### Handling Errors

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Examples of transforming error types with `mapError` and recovering from specific errors using `tryRecover` and `tryRecoverAsync`.

```ts
// Transform error type
const result = fetchUser(id).mapError((e) => new AppError(`Failed to fetch user: ${e.message}`));

// Recover from specific errors while preserving the same success type
const result = fetchUser(id).tryRecover((e) =>
  e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e)
);

// Async recovery follows the same pattern
// If fetchUser is async and returns Promise<Result<User, E>>, await it first.
const result = await (
  await fetchUser(id)
).tryRecoverAsync(async (e) =>
  e._tag === "NetworkError" ? Result.ok(await readUserFromCache(id)) : Result.err(e)
);
```

--------------------------------

### Serialization and Deserialization

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Provides examples of serializing `Result` instances to plain objects and deserializing them back, including handling invalid input and typed boundaries for server actions.

```typescript
import { Result, SerializedResult, ResultDeserializationError } from "better-result";

// Serialize to plain object
const result = Result.ok(42);
const serialized = Result.serialize(result);
// { status: "ok", value: 42 }

// Deserialize back to Result instance
const deserialized = Result.deserialize<number, never>(serialized);
// Ok(42) - can use .map(), .andThen(), etc.

// Invalid input returns ResultDeserializationError
const invalid = Result.deserialize({ foo: "bar" });
if (Result.isError(invalid) && ResultDeserializationError.is(invalid.error)) {
  console.log("Bad input:", invalid.error.value);
}

// Typed boundary for Next.js server actions
async function createUser(data: FormData): Promise<SerializedResult<User, ValidationError>> {
  const result = await validateAndCreate(data);
  return Result.serialize(result);
}

// Client-side
const serialized = await createUser(formData);
const result = Result.deserialize<User, ValidationError>(serialized);
```

--------------------------------

### Observing Results - Static Helpers

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Shows how to use static helper functions for observing results, supporting both data-first and data-last styles.

```ts
const traced = Result.tapError(Result.err("cache miss"), (error) => {
  console.warn("cache lookup failed", error);
});

const traceError = Result.tapErrorAsync(async (error: string) => {
  await trace("cache.lookup_failed", { error });
});

await traceError(Result.err("cache miss"));
```

--------------------------------

### Observing Results - TapBoth

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Demonstrates using `tapBoth` for observing both success and error branches symmetrically.

```ts
const result = Result.try(() => JSON.parse(input)).tapBoth({
  ok: (value) => {
    console.info("decoded payload", value);
  },
  err: (error) => {
    console.warn("decode failed", error);
  },
});
```

--------------------------------

### Observing Results - Tap

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Using `tap`, `tapAsync`, `tapError`, `tapErrorAsync`, `tapBoth`, and `tapBothAsync` for side effects like logging or tracing without transforming the Result.

```ts
const result = Result.try(() => JSON.parse(input))
  .tap((value) => {
    console.debug("parsed payload", value);
  })
  .tapError((error) => {
    console.error("failed to parse payload", error);
  });
```

--------------------------------

### Transforming Results

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Demonstrates transforming Result values using `map` and `andThen`, including standalone and pipeable function styles.

```ts
const result = Result.ok(2)
  .map((x) => x * 2) // Ok(4)
  .andThen(
    (
      x, // Chain Result-returning functions
    ) => (x > 0 ? Result.ok(x) : Result.err("negative"))
  );

// Standalone functions (data-first or data-last)
Result.map(result, (x) => x + 1);
Result.map((x) => x + 1)(result); // Pipeable
```

--------------------------------

### Retry Support

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Basic retry mechanism for promises with configurable times, delay, and backoff strategy.

```typescript
const result = await Result.tryPromise(() => fetch(url), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential", // or "linear" | "constant"
  },
});
```

--------------------------------

### Accessing Original Exception

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Shows how to access the original exception via the .cause property when an UnhandledException occurs.

```typescript
if (Result.isError(result)) {
  const original = result.error.cause;
  if (original instanceof SyntaxError) {
    // Handle JSON parse error
  }
}
```

--------------------------------

### Custom TaggedError Constructor

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Demonstrates adding a custom constructor to a `TaggedError` class to compute error messages dynamically.

```typescript
class NetworkError extends TaggedError("NetworkError")<{
  url: string;
  status: number;
  message: string;
}>() {
  constructor(args: { url: string; status: number }) {
    super({ ...args, message: `Request to ${args.url} failed: ${args.status}` });
  }
}

new NetworkError({ url: "/api", status: 404 });
```

--------------------------------

### Extracting Values

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Methods for extracting values from a Result, including `unwrap`, `unwrapOr`, and pattern matching with `match`.

```ts
// Unwrap (throws on Err)
const value = result.unwrap();
const value = result.unwrap("custom error message");

// With fallback
const value = result.unwrapOr(defaultValue);

// Pattern match
const value = result.match({
  ok: (v) => v,
  err: (e) => fallback,
});
```

--------------------------------

### TaggedError Usage

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Illustrates creating and using custom `TaggedError` classes for discriminated unions, including factory API, object arguments, exhaustive and partial matching, and type guards.

```typescript
import { Result, TaggedError, matchError, matchErrorPartial } from "better-result";

// Factory API: TaggedError("Tag")<Props>()
class NotFoundError extends TaggedError("NotFoundError")<{
  id: string;
  message: string;
}>() {}

class ValidationError extends TaggedError("ValidationError")<{
  field: string;
  message: string;
}>() {}

type AppError = NotFoundError | ValidationError;

// Create errors with object args
const err = new NotFoundError({ id: "123", message: "User not found" });

// Exhaustive matching
matchError(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Bad field: ${e.field}`,
});

// Partial matching with fallback
matchErrorPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown: ${e.message}`,
);

// Type guards
TaggedError.is(value); // any tagged error
NotFoundError.is(value); // specific class
```

--------------------------------

### Async Generator Composition

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Async version with Result.await() for chaining asynchronous operations.

```typescript
const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser(id));
  const posts = yield* Result.await(fetchPosts(user.id));
  return Result.ok({ user, posts });
});
```

--------------------------------

### Async Retry Decisions

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Handle async retry decisions by enriching the error in the catch handler.

```typescript
class ApiError extends TaggedError("ApiError")<{
  message: string;
  rateLimited: boolean;
}>() {}

const result = await Result.tryPromise(
  {
    try: () => callApi(url),
    catch: async (e) => {
      // Fetch async state in catch handler
      const retryAfter = await redis.get(`ratelimit:${userId}`);
      return new ApiError({
        message: (e as Error).message,
        rateLimited: retryAfter !== null,
      });
    },
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => !e.rateLimited, // Sync predicate uses enriched error
    },
  },
);
```

--------------------------------

### Yielding Tagged Errors in Result.gen

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Shows how `TaggedError` instances can be yielded directly within `Result.gen` to short-circuit execution, behaving like `Result.err(error)` and contributing to the inferred error union.

```typescript
const result = Result.gen(function* () {
  yield* new NotFoundError({ id: "123", message: "missing" });
  return Result.ok("never reached");
});
// Result<string, NotFoundError>
// => Err(original NotFoundError instance)

const result = Result.gen(function* () {
  const user = yield* findUser("123"); // Result<User, NotFoundError>

  if (!user.active) {
    yield* new ValidationError({ field: "active", message: "User is inactive" });
  }

  return Result.ok(user);
});
// Result<User, NotFoundError | ValidationError>
```

--------------------------------

### Generator Composition

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Chain multiple Results without nested callbacks or early returns using Result.gen().

```typescript
const result = Result.gen(function* () {
  const a = yield* parseNumber(inputA); // Unwraps or short-circuits
  const b = yield* parseNumber(inputB);
  const c = yield* divide(a, b);
  return Result.ok(c);
});
// Result<number, ParseError | DivisionError>
```

--------------------------------

### Conditional Retry

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Retry only for specific error types using the shouldRetry option.

```typescript
class NetworkError extends TaggedError("NetworkError")<{ message: string }>() {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }>() {}

const result = await Result.tryPromise(
  {
    try: () => fetchData(url),
    catch: (e) =>
      e instanceof TypeError // Network failures often throw TypeError
        ? new NetworkError({ message: (e as Error).message })
        : new ValidationError({ message: String(e) }),
  },
  {
    retry: {
      times: 3,
      delayMs: 100,
      backoff: "exponential",
      shouldRetry: (e) => e._tag === "NetworkError", // Only retry network errors
    },
  },
);
```

--------------------------------

### Normalizing Error Types

Source: https://github.com/dmmulroy/better-result/blob/main/README.md

Use mapError on the output of Result.gen() to unify multiple error types into a single type.

```typescript
class ParseError extends TaggedError("ParseError")<{ message: string }>() {}
class ValidationError extends TaggedError("ValidationError")<{ message: string }>() {}
class AppError extends TaggedError("AppError")<{ source: string; message: string }>() {}

const result = Result.gen(function* () {
  const parsed = yield* parseInput(input); // Err: ParseError
  const valid = yield* validate(parsed); // Err: ValidationError
  return Result.ok(valid);
}).mapError((e): AppError => new AppError({ source: e._tag, message: e.message }));
// Result<ValidatedData, AppError> - error union normalized to single type
```
