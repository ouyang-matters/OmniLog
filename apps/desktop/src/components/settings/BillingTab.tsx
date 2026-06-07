import { useEffect, useState } from "react";
import type { License } from "@omnilog/shared";
import { getClient, useApp } from "../../store/appStore";

/**
 * Master switch for online payments. Kept off until billing is fully live —
 * plan cards still render (so users can see what's coming) but Subscribe is
 * disabled. Flip to `true` to enable Stripe checkout.
 */
const PAYMENTS_OPEN = false;

/**
 * "Billing" tab — only mounted when the active connection is an official
 * hosted server. Shows the caller's plan and gives two actions:
 *
 *  - Subscribe / change plan → POST /api/billing/checkout → open URL
 *  - Manage subscription      → POST /api/billing/portal   → open URL
 *
 * The opened URL is sent to the OS browser via Tauri's opener (rather than
 * the webview, which would replace the app). Self-hosted servers don't show
 * this tab at all — see `SettingsPage` for the visibility check.
 */
export function BillingTab() {
  const me = useApp((s) => s.me);
  const [license, setLicense] = useState<License | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    client
      .getLicense()
      .then(setLicense)
      .catch((e) => {
        // 404 means "this server isn't billing-enabled". Show a soft message.
        const msg = e instanceof Error ? e.message : "Failed to load license.";
        if (/HTTP\s*404|not found/i.test(msg)) {
          setError("This server doesn't have billing enabled.");
        } else {
          setError(msg);
        }
      });
  }, []);

  async function onSubscribe(plan: "pro" | "team") {
    const client = getClient();
    if (!client) return;
    setError(null);
    setBusy("checkout");
    try {
      const res = await client.startCheckout(plan);
      await openExternal(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
    } finally {
      setBusy(null);
    }
  }

  async function onManage() {
    const client = getClient();
    if (!client) return;
    setError(null);
    setBusy("portal");
    try {
      const res = await client.openCustomerPortal();
      await openExternal(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the portal.");
    } finally {
      setBusy(null);
    }
  }

  if (error && !license) {
    return (
      <div className="settings-pane">
        <h2>Billing</h2>
        <div className="alert error inline">{error}</div>
      </div>
    );
  }

  const plan = license?.plan ?? "free";
  const status = license?.status ?? "active";
  const periodEnd = license?.currentPeriodEnd
    ? new Date(license.currentPeriodEnd).toLocaleString()
    : null;
  const onPaidPlan = plan !== "free";
  const isBootstrap = me?.id === "local-user";

  return (
    <div className="settings-pane">
      <h2>Billing</h2>
      <p className="muted small">
        Subscription and entitlement on this official server. Checkout and
        cancellation are handled through Stripe — clicking either button
        opens it in your browser.
      </p>

      {!PAYMENTS_OPEN && (
        <div className="alert inline">
          🔒 Online payments aren't open yet. Use the Free tier now — you'll be
          able to upgrade here once billing launches.
        </div>
      )}

      <section className="settings-section">
        <h4>Current plan</h4>
        <div className="plan-summary">
          <span className={`plan-badge plan-${plan}`}>{plan}</span>
          <div className="muted small">
            Status: <strong>{status}</strong>
            {periodEnd && <> · renews / ends {periodEnd}</>}
          </div>
        </div>
        {license?.features && license.features.length > 0 && (
          <ul className="feature-list">
            {license.features.map((f) => (
              <li key={f}>{prettyFeature(f)}</li>
            ))}
          </ul>
        )}
      </section>

      {isBootstrap && (
        <div className="alert inline">
          You're signed in as the bootstrap admin (API token) — subscriptions
          attach to real user accounts. Sign in as a regular user to subscribe.
        </div>
      )}

      <section className="settings-section">
        <h4>Plans</h4>
        <div className="plan-cards">
          <PlanCard
            name="Free"
            price="$0"
            tagline="Forever-free essentials."
            features={[
              "Local + cloud sync",
              "Basic version history",
              "Image attachments",
            ]}
            current={plan === "free"}
          />
          <PlanCard
            name="Pro"
            price="paid"
            tagline="For serious note-takers."
            features={[
              "Cloud backup",
              "Unlimited version history",
              "Larger image quota",
            ]}
            current={plan === "pro"}
            primaryLabel={!PAYMENTS_OPEN ? "Coming soon" : onPaidPlan ? "Change to Pro" : "Subscribe"}
            onSelect={() => void onSubscribe("pro")}
            disabled={!PAYMENTS_OPEN || isBootstrap || busy !== null}
            busy={busy === "checkout"}
          />
          <PlanCard
            name="Team"
            price="paid"
            tagline="For shared workspaces."
            features={[
              "Everything in Pro",
              "Team sharing",
              "Audit log",
            ]}
            current={plan === "team"}
            primaryLabel={!PAYMENTS_OPEN ? "Coming soon" : onPaidPlan ? "Change to Team" : "Subscribe"}
            onSelect={() => void onSubscribe("team")}
            disabled={!PAYMENTS_OPEN || isBootstrap || busy !== null}
            busy={busy === "checkout"}
          />
        </div>
      </section>

      {onPaidPlan && (
        <section className="settings-section">
          <h4>Manage</h4>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Update your card, change plans, or cancel through Stripe's
            customer portal.
          </div>
          <button
            className="btn"
            onClick={() => void onManage()}
            disabled={busy !== null}
          >
            {busy === "portal" ? "Opening…" : "Open customer portal"}
          </button>
        </section>
      )}

      {error && <div className="alert error inline">{error}</div>}
    </div>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  current?: boolean;
  primaryLabel?: string;
  onSelect?: () => void;
  disabled?: boolean;
  busy?: boolean;
}

function PlanCard({
  name,
  price,
  tagline,
  features,
  current,
  primaryLabel,
  onSelect,
  disabled,
  busy,
}: PlanCardProps) {
  return (
    <div className={`plan-card ${current ? "current" : ""}`}>
      <div className="plan-card-head">
        <strong>{name}</strong>
        <span className="muted small">{price}</span>
      </div>
      <div className="muted small">{tagline}</div>
      <ul className="feature-list">
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {current ? (
        <div className="muted small plan-current-tag">Current plan</div>
      ) : (
        primaryLabel && (
          <button
            className="btn primary block"
            onClick={onSelect}
            disabled={disabled}
          >
            {busy ? "Opening…" : primaryLabel}
          </button>
        )
      )}
    </div>
  );
}

function prettyFeature(slug: string): string {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Open `url` in the system browser. Tauri 2 exposes this via the `opener`
 * plugin, but loading the plugin only to open one URL each session is
 * overkill — `window.open(url, "_blank")` falls back to the webview shell's
 * "external URL" behaviour, which Tauri intercepts and hands off to the OS.
 */
async function openExternal(url: string): Promise<void> {
  // Tauri's webview blocks navigation in the current tab when target=_blank,
  // and the shell opens the URL in the user's default browser instead.
  window.open(url, "_blank", "noopener,noreferrer");
}
