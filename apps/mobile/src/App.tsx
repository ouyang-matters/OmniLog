import { useEffect } from "react";
import { useApp } from "./store/appStore";
import { LoginPage } from "./components/LoginPage";
import { EntryList } from "./components/EntryList";
import { EntryView } from "./components/EntryView";
import { SettingsPage } from "./components/SettingsPage";

export function App() {
  const phase = useApp((s) => s.phase);
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (phase === "loading") {
    return (
      <div className="centered">
        <div className="spinner" />
      </div>
    );
  }

  if (phase === "setup") {
    return <LoginPage />;
  }

  switch (view) {
    case "editor":
      return <EntryView />;
    case "settings":
      return <SettingsPage />;
    case "connect":
      return <LoginPage showBack />;
    default:
      return <EntryList />;
  }
}
