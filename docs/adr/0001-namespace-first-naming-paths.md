# ADR 0001: Namespace-first naming paths

- **Status:** Accepted
- **Scope:** How we name resources, features, and their operations

## Context

Names that mix snake_case, kebab-case, and camelCase are difficult to scan. A name
such as `repository-get-source-package` also leaves the reader guessing which
words name the resource, which describe its context, and which name the action.
Names become harder to follow when they include context inherited from a parent.

A naming convention should make these parts clear and group related operations
together. Adding new contexts should not change existing names. The convention
should work regardless of the programming language, network protocol, or interface
that uses it.

## Decision

Put the subject first, any namespaces next, and the operation last:

```text
subject[.namespace...].operation
```

- **Subject:** The resource or feature, such as `repository` or `account`.
- **Namespace:** A named context or variant, such as `sourcePackage` or `self`.
  It must be explicitly defined, and may come from a parent context. A path can
  have no namespaces, one namespace, or several.
- **Operation:** The action or feature selected by the name, such as `get`.

Every part uses lowerCamelCase. Dots separate the parts of the path, not the words
within a part: use `sourcePackage`, not `source.package`.

These paths are names, not filesystem paths, URLs, or executable expressions.
This convention does not rename fields in requests or responses, URL segments,
or values sent to the server to select an operation.

### Component spelling

Components must match `^[a-z][A-Za-z0-9]*$` and follow these spelling rules:

- Normalize word separators and casing consistently: `source_package` and
  `source-package` become `sourcePackage`.
- Treat acronyms as words: `getByURL` becomes `getByUrl`, `API_client` becomes
  `apiClient`, and a standalone `PPA` becomes `ppa`.
- Keep the meaning of the original name. Do not change plural subjects to
  singular, expand abbreviations, or replace operation names with guessed
  synonyms. For example, `project` and `projects` remain distinct.
- Prefer action verbs for new operations. For existing operations, use the names
  in their source definitions rather than guessing from their descriptions.
- Reject names that cannot follow these rules unless the API or specification
  that defines them supplies an explicit name. Do not silently remove unsupported
  characters or erase differences in meaning.

Illustrative examples:

| Existing form | Namespace-first form |
| --- | --- |
| `repository-get-source-package` | `repository.sourcePackage.get` |
| `artifact-getByURL-registry` | `artifact.registry.getByUrl` |
| `account-get-self` | `account.self.get` |
| `projects-new_project` | `projects.newProject` |

### Namespace structure

The source metadata must explicitly define where each namespace starts and ends.
A multiword label stays in one component; context inherited from a parent can
span several components:

```text
repository.sourcePackage.get
review.repository.sourcePackage.get
```

The first name has `repository` as its subject and `sourcePackage` as its
namespace. The second has `review` as its subject and two namespace components:
`repository` and `sourcePackage`.

Store these parts separately, for example:

```ts
const namingPath = {
  subject: "review",
  namespace: ["repository", "sourcePackage"],
  operation: "get",
};
```

Do not reconstruct hierarchy by replacing every hyphen or underscore with a dot.
A separator in an existing name may mark either a word boundary or a context
boundary.

Do not automatically remove repeated labels. If two levels have the same label
but different meanings, the owner of the API or specification must decide whether
to keep both or give them more precise names.

### Operations without namespaces and aliases

When no namespace is declared, omit it:

```text
account.get
account.self.get
repository.get
repository.project.get
```

Do not invent `default`, `canonical`, or numbered namespaces. Adding, removing,
or reordering other contexts must not rename an existing operation.

Use an alias's declared name; do not guess a name from its URL or where it happens
to resolve at runtime. Namespaces describe contexts, not individual instances.
Identifiers, owners, versions, and other request data remain separate inputs
unless the API or specification explicitly defines them as named variants.

### Uniqueness and stability

Each complete path must be unique within the API or specification that defines
it. Applying the spelling rules can turn two different names into the same path.
If that happens, report an error that identifies both source definitions. Do not
resolve the conflict by adding numbers or choosing whichever name was found first.

Code that exposes names as nested objects must also reject paths that use the
same part as both an operation and a namespace. For example, `account.get` and
`account.get.details` would require `get` to be both. Code that uses names as
strings does not need to expose nested objects.

## Interface implications

A dotted identifier can remain an ordinary lookup key:

```ts
client.request("repository.sourcePackage.get", input);
```

A method hierarchy is a separate interface decision:

```ts
client.repository.sourcePackage.get(input);
```

This ADR does not require nested methods. It also does not require filenames,
package export paths, or type names to contain dots. Generated names may follow
the programming language's conventions, such as
`RepositorySourcePackageGetResponse`, as long as each name clearly maps back to
its source definition.

Do not derive request URLs or operation-selection values from these names.
Continue to read them from the API's source metadata.

## Consequences

### Benefits

- One casing convention replaces mixed spelling styles.
- Dots make subjects, contexts, and operations easy to distinguish.
- Shared prefixes group operations for the same context together.
- Separate namespace components make inherited contexts easier to read.
- Names work as string lookup keys without requiring a nested method interface.

### Costs

- Dotted names are more structured, but not necessarily shorter.
- Metadata that combined inherited labels into a single string may need to store
  namespace components separately.
- Both the naming paths and names generated from them must be checked for conflicts.
