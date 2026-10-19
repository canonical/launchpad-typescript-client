import { toCase } from "@hey-api/shared";

/** Spell an upstream operation ID as the pinned parser names its symbol. */
export default function formatOperationSymbolName(id: string): string {
  const sanitized = id
    .replace(/^[^\p{ID_Start}]+/u, "")
    .replace(/[^$\u200c\u200d\p{ID_Continue}]/gu, "-")
    .replace(/[$+]/g, "-");
  return toCase(sanitized, "camelCase");
}
