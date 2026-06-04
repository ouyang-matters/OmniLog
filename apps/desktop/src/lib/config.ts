/**
 * Re-exports from @omnilog/core. Existing callers that import connection
 * helpers from this path keep working unchanged.
 */
export type { ConnectionsState } from "@omnilog/core";
export {
  DEFAULT_SERVER_URL,
  newConnection,
  isConnectionUsable,
  connectionToConfig,
} from "@omnilog/core";
