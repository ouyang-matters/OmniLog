//! Email sending abstraction. The `EmailSender` trait decouples the server from
//! any specific email provider. Swap in a real implementation (SMTP, SendGrid,
//! ThreadLedger's mail system, etc.) via the `AppState`.

use async_trait::async_trait;

use crate::error::AppResult;

/// A single outbound email.
pub struct Email<'a> {
    pub to: &'a str,
    pub subject: &'a str,
    pub body_html: &'a str,
}

#[async_trait]
pub trait EmailSender: Send + Sync {
    /// Send an email. Returns `Ok(())` on success.
    async fn send(&self, email: Email<'_>) -> AppResult<()>;

    /// Whether this sender actually delivers mail. When false the server still
    /// generates tokens but skips calling `send()`, so the flow works in dev
    /// (tokens are logged to stdout instead).
    fn is_live(&self) -> bool;
}

/// Stub sender that logs to tracing. Used when no email backend is configured.
pub struct LogEmailSender;

#[async_trait]
impl EmailSender for LogEmailSender {
    async fn send(&self, email: Email<'_>) -> AppResult<()> {
        tracing::info!(
            to = email.to,
            subject = email.subject,
            "[email-stub] would send email (no backend configured)"
        );
        Ok(())
    }

    fn is_live(&self) -> bool {
        false
    }
}
