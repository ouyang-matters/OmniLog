/**
 * Backward-compatibility shim. Components in apps/desktop/ that haven't moved
 * to @omnilog/ui yet can still `import { useApp, getClient } from "../store/appStore"`.
 *
 * New code should import directly from @omnilog/ui (useApp, getClient).
 */
export { useApp, getClient } from "@omnilog/ui";
