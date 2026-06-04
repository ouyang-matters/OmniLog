// React bridge
export {
  CoreProvider,
  useApp,
  useClient,
  getClient,
  getAppState,
  registerCore,
  PlatformUIProvider,
  usePlatformUI,
  type PlatformUI,
} from "./context.js";

// Layout
export { MainLayout } from "./MainLayout.js";
export { SettingsPage } from "./SettingsPage.js";
export { SetupPage } from "./SetupPage.js";
export { SignedOutLanding } from "./SignedOutLanding.js";
export { Sidebar } from "./Sidebar.js";
export { EditorPane } from "./EditorPane.js";
export { MetaPane } from "./MetaPane.js";
export { ServerSwitcher } from "./ServerSwitcher.js";
export { MessagesPanel } from "./MessagesPanel.js";
export { ShareModal } from "./ShareModal.js";
export { HistoryModal } from "./HistoryModal.js";
export { FolderPicker, descendantsOf } from "./FolderPicker.js";

// Icons
export { Icon, type IconName } from "./icons/index.js";

// Editor
export { RichEditor } from "./editor/RichEditor.js";
export { LatexEditor } from "./editor/LatexEditor.js";
export { MarkdownEditor } from "./editor/MarkdownEditor.js";
export { Toolbar } from "./editor/Toolbar.js";
export { ModeSwitcher } from "./editor/ModeSwitcher.js";
export { MathDialog } from "./editor/MathDialog.js";
export { InlineMathPopover } from "./editor/InlineMathPopover.js";

// Settings tabs
export { ProfileTab, AvatarFrame } from "./settings/ProfileTab.js";
export { AccountTab } from "./settings/AccountTab.js";
export { UsersTab } from "./settings/UsersTab.js";
export { ServerTab } from "./settings/ServerTab.js";
export { AdvancedTab } from "./settings/AdvancedTab.js";
export { ConnectionsTab } from "./settings/ConnectionsTab.js";
export { AddConnectionDialog } from "./settings/AddConnectionDialog.js";
export { BillingTab } from "./settings/BillingTab.js";
