import { useEffect } from "react";
import {
  CoreProvider,
  PlatformUIProvider,
  SetupPage,
  SignedOutLanding,
  MainLayout,
  SettingsPage,
  useApp,
} from "@omnilog/ui";
import { core, tauriPlatformUI } from "./shell";

/** Provide core store + platform UI to the shared component tree. */
export function App() {
  return (
    <CoreProvider value={core}>
      <PlatformUIProvider value={tauriPlatformUI}>
        <AppInner />
      </PlatformUIProvider>
    </CoreProvider>
  );
}

function AppInner() {
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

  if (phase === "setup") {
    return connections.length > 0 ? <SignedOutLanding /> : <SetupPage />;
  }

  return view === "settings" ? <SettingsPage /> : <MainLayout />;
}
