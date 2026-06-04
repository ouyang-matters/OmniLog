/**
 * Re-exports from @omnilog/core. Components that import Draft / isLocalId /
 * entryToDraft from this path keep working without any import changes.
 */
export type { Draft } from "@omnilog/core";
export { isLocalId, newLocalId, entryToDraft } from "@omnilog/core";
