import { useEffect } from "react";
import { useApp } from "./store/appStore";
import { SetupPage } from "./components/SetupPage";
import { SignedOutLanding } from "./components/SignedOutLanding";
import { MainLayout } from "./components/MainLayout";
import { SettingsPage } from "./components/SettingsPage";
import { DialogHost } from "./ui/dialog";

export function App() {
  const phase = useApp((s) => s.phase);
  const view = useApp((s) => s.view);
  const connections = useApp((s) => s.connections);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  let content: JSX.Element;
  if (phase === "loading") {
    content = (
      <div className="centered">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  } else if (phase === "setup") {
    // Signed-out states. SetupPage is the first-run experience (with the
    // one-click local-server affordance). If the user already has saved
    // connections, prefer the picker so they don't see a bare empty form.
    content = connections.length > 0 ? <SignedOutLanding /> : <SetupPage />;
  } else {
    content = view === "settings" ? <SettingsPage /> : <MainLayout />;
  }

  return (
    <>
      {content}
      <DialogHost />
    </>
  );
}
