import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function versionChanged(before, after) {
  if (before.name !== after.name || after.private === true) {
    throw new Error("Publishing requires the same, public package name");
  }
  for (const manifest of [before, after]) {
    if (typeof manifest.version !== "string" || !manifest.version.trim()) {
      throw new Error("Both manifests must have a version");
    }
  }
  return before.version !== after.version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, after, manifest] = process.argv.slice(2);
  if (![before, after].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
    throw new Error("Expected full before and after commit SHAs");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", before, after]);
  const read = (sha) => JSON.parse(execFileSync("git", ["show", `${sha}:${manifest}`], { encoding: "utf8" }));
  console.log(versionChanged(read(before), read(after)));
}
