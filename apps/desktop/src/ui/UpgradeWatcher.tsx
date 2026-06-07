import { useEffect, useRef } from "react";
import { useApp } from "../store/appStore";
import { confirmDialog } from "./dialog";

/**
 * Shows an upgrade prompt whenever a plan limit (HTTP 402) is hit anywhere in
 * the app. The server enforces the limits; this just surfaces them and
 * deep-links to the Billing tab. Mounted once at the app root.
 */
export function UpgradeWatcher() {
  const upgrade = useApp((s) => s.upgrade);
  const openBilling = useApp((s) => s.openBilling);
  const dismissUpgrade = useApp((s) => s.dismissUpgrade);
  const handling = useRef(false);

  useEffect(() => {
    if (!upgrade || handling.current) return;
    handling.current = true;
    void confirmDialog({
      title: "You've hit a free-plan limit",
      message: upgrade,
      confirmLabel: "See plans",
      cancelLabel: "Not now",
    }).then((go) => {
      handling.current = false;
      if (go) openBilling();
      else dismissUpgrade();
    });
  }, [upgrade, openBilling, dismissUpgrade]);

  return null;
}
