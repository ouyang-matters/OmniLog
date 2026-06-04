import { useEffect, useState } from "react";
import type { PublicUser } from "@omnilog/shared";
import { useApp } from "./context";
import { Icon } from "./icons/index";
import { ProfileTab } from "./settings/ProfileTab";
import { AccountTab } from "./settings/AccountTab";
import { ConnectionsTab } from "./settings/ConnectionsTab";
import { BillingTab } from "./settings/BillingTab";
import { UsersTab } from "./settings/UsersTab";
import { ServerTab } from "./settings/ServerTab";
import { AdvancedTab } from "./settings/AdvancedTab";

type TabId = "profile" | "account" | "connections" | "billing" | "users" | "server" | "advanced";

interface Tab {
  id: TabId;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  /** Visible to the given user? Defaults to "everyone". */
  visible?: (me: PublicUser | null) => boolean;
}

const TABS: Tab[] = [
  { id: "profile", label: "Profile", icon: "users" },
  { id: "account", label: "Account", icon: "key" },
  { id: "connections", label: "Connections", icon: "folderShared" },
  {
    id: "billing",
    label: "Billing",
    icon: "key",
    // Only meaningful on the official hosted server. Self-hosted instances
    // 404 the license endpoint anyway; hiding the tab avoids confusion.
    visible: () => {
      const active = useApp.getState().connections.find(
        (c) => c.id === useApp.getState().activeConnectionId,
      );
      return active?.kind === "official";
    },
  },
  {
    id: "users",
    label: "Users",
    icon: "users",
    visible: (me) => me?.role === "admin" || me?.role === "owner",
  },
  { id: "server", label: "Server", icon: "folder" },
  {
    id: "advanced",
    label: "Advanced",
    icon: "edit",
    visible: (me) => me?.role === "owner",
  },
];

/**
 * Full-screen Settings page. Replaces the old `SettingsModal`. Layout: left
 * vertical tab list, right pane shows the active tab. Top bar has a back
 * button that returns to the editor view.
 */
export function SettingsPage() {
  const me = useApp((s) => s.me);
  const loadMe = useApp((s) => s.loadMe);
  const loadSettings = useApp((s) => s.loadSettings);
  const closeSettings = useApp((s) => s.closeSettings);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  const deepLinkTab = useApp((s) => s.settingsTab);
  const [active, setActive] = useState<TabId>("profile");

  // Honour a deep-link request (e.g. ServerSwitcher → "connections") if the
  // caller dropped a settingsTab id into the store before opening us.
  useEffect(() => {
    if (deepLinkTab) {
      setActive(deepLinkTab as TabId);
      useApp.setState({ settingsTab: null });
    }
  }, [deepLinkTab]);

  // Load /auth/me and /api/settings whenever this page is mounted, so the
  // first paint is fresh even if the user has been editing for a while.
  useEffect(() => {
    void loadMe();
    void loadSettings();
  }, [loadMe, loadSettings]);

  // Esc returns to the editor — quick exit if the user wandered in by accident.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeSettings();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  const visibleTabs = TABS.filter((t) => !t.visible || t.visible(me));
  // If the active tab was hidden by a role change, drop back to Profile.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === active)) setActive("profile");
  }, [active, visibleTabs]);

  return (
    <div className="settings-page">
      <header className="topbar">
        <button className="btn ghost back-btn" onClick={closeSettings}>
          ← Back
        </button>
        <span className="brand">Settings</span>
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => void toggleTheme()} title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`settings-nav-item ${active === tab.id ? "active" : ""}`}
              onClick={() => setActive(tab.id)}
            >
              <Icon name={tab.icon} size={14} />
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="settings-content">
          {active === "profile" && <ProfileTab />}
          {active === "account" && <AccountTab />}
          {active === "connections" && <ConnectionsTab />}
          {active === "billing" && <BillingTab />}
          {active === "users" && <UsersTab />}
          {active === "server" && <ServerTab />}
          {active === "advanced" && <AdvancedTab />}
        </main>
      </div>
    </div>
  );
}
