import { useEffect } from "react";
import { useApp } from "./store/appStore";
import { SetupPage } from "./components/SetupPage";
import { SignedOutLanding } from "./components/SignedOutLanding";
import { MainLayout } from "./components/MainLayout";
import { SettingsPage } from "./components/SettingsPage";

export function App() {
  const phase = useApp((s) => s.phase);
  const view = useApp((s) => s.view);
  const connections = useApp((s) => s.connections);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (phase === "loading") {
    return (
      <div className="centered">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  // Signed-out states. SetupPage is the first-run experience (with the
  // one-click local-server affordance). If the user already has saved
  // connections, prefer the picker so they don't see a bare empty form.
  if (phase === "setup") {
    return connections.length > 0 ? <SignedOutLanding /> : <SetupPage />;
  }

  return view === "settings" ? <SettingsPage /> : <MainLayout />;
}
