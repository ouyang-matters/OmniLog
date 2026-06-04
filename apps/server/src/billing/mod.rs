//! Billing subsystem — Stripe wrapper + license helpers used by the official
//! hosted deployment. Self-hosted instances leave `STRIPE_SECRET_KEY` empty
//! and every route under `/api/billing/*` returns 404; nothing in this
//! module is reachable at runtime.
//!
//! The wrapper is hand-rolled on top of `reqwest` rather than pulling in
//! `async-stripe`. We only need four operations (create customer + checkout
//! session, create portal session, fetch a subscription, verify webhook
//! signatures), and skipping the huge async-stripe types tree keeps the
//! shared self-host binary lean.

pub mod stripe;
