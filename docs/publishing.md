# Mirroring and npm publishing

Launchpad remains authoritative: review merge proposals and merge into `main`
there. GitHub is a public mirror and the npm publishing runner, not a second
place to merge changes. Keep workflow changes in Launchpad so mirroring does
not overwrite them.

Workflow changes need an authenticated direct push of the same Launchpad commit
to GitHub (for example, over SSH). The scheduled mirror's `GITHUB_TOKEN` cannot
create or update workflow files. Push workflow updates to both remotes; otherwise
the next scheduled mirror can fail. Do not make a separate GitHub-only commit.

`sync.yaml` reuses the pinned `canonical/launchpad-actions` sync workflow every
15 minutes (GitHub may delay scheduled runs). It records GitHub's previous
`main`, mirrors Launchpad, and dispatches `publish-npm.yaml` only if the publishable
`packages/client/package.json` differs. Explicit dispatch is necessary because mirror pushes
using `GITHUB_TOKEN` do not trigger push workflows.

Publishing compares the manifest versions at the two ends of the sync, not
just the last commit. A dependency-only edit does not publish; several bumps
in one sync publish only the final version. Bumps reverted before syncing do
not publish. Non-fast-forward main updates fail closed for manual inspection.
Only version changes publish; npm rejects versions already on the registry.
A first push establishing the mirror is a baseline, not a release.

## Initial setup

1. Create the public GitHub repository `canonical/launchpad-typescript-client` with default
   branch `main`. Merge these files on Launchpad and seed the GitHub mirror from
   Launchpad, including the workflows. Do not initialize a separate GitHub history.
2. Enable GitHub Actions and allow the pinned reusable workflow from
   `canonical/launchpad-actions`. Allow the sync workflow to write repository
   contents and dispatch Actions. GitHub rules must allow this workflow to mirror
   refs; do not require GitHub pull requests for mirrored updates.
3. In the npm settings for `@canonical/launchpad-client`, add a trusted publisher:
   - Provider: **GitHub Actions**
   - Organization: **canonical**
   - Repository: **launchpad-typescript-client**
   - Workflow filename: **publish-npm.yaml** (not its display name)
   - Environment: leave empty (this workflow does not use a GitHub environment).
4. Merge a version bump on Launchpad, updating `pnpm-lock.yaml` if needed, and
   wait for the sync or manually run **Sync with Launchpad repository** on `main`.

Publishing runs on a GitHub-hosted runner with Node 24, npm 11 (OIDC requires
npm 11.5.1 or newer), and `id-token: write`. No `NPM_TOKEN` secret is required.
The private workspace root and the placeholder mock-api package are not published.
Client generation uses the checked-in snapshots, never a live schema refresh.
Both the pnpm workspace lockfile and the tooling npm lockfile are installed
before generation, typechecking, tests, and the build. These must pass before `npm publish --provenance --access public`.
The package's GitHub `repository` metadata matches the provenance identity;
this does not change where development happens.

If the package does not yet exist on npm, create it with an initial authorized
publish before configuring its trusted publisher. Once OIDC works, remove any
obsolete automation tokens and restrict token-based publishing in npm.

## Retry a failed release

Re-running sync after a successful mirror does not dispatch the same change
again. Re-run the failed publishing run, or dispatch **Publish to npm** on `main`
with the original `before` and `after` commit SHAs. The selected release commit
must be on mirrored `main`. Do not bump the version just to retry a failed build
or authentication setup. Already-published versions cannot be overwritten.

Local workflow checks:

```console
node --test .github/scripts/*.test.mjs
zizmor .github/workflows
```
