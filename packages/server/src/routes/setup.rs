//! First-boot installer state.
//!
//! Single-key persistence (`SETUP_COMPLETE`) stored in the same overrides
//! file that `settings.rs` uses, but deliberately *not* listed in that
//! module's `SETTINGS` allowlist — so it can't be poked via the public
//! `/api/settings-write` surface.
//!
//! Auth model:
//!   - GET  /api/setup-status   always public (the installer SPA itself
//!                              needs to call this with no credentials)
//!   - POST /api/setup-complete
//!       * when setup is currently incomplete → public (first-boot)
//!       * when setup is currently complete   → owner only (loopback or
//!                                              forwarded HTTPS), matching
//!                                              the rest of `/api/*`
//!
//! Integration state (`tailscale`, `bluesky`) is stubbed to
//! `{state: "not_configured"}` here in PR 1; the integration modules will
//! plug in real status getters in follow-up PRs.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::routes::settings::{read_overrides, write_overrides};
use crate::AppState;

const SETUP_COMPLETE_KEY: &str = "SETUP_COMPLETE";

pub(crate) fn is_setup_complete(state: &AppState) -> bool {
    read_overrides(state)
        .get(SETUP_COMPLETE_KEY)
        .map(|v| v == "true")
        .unwrap_or(false)
}

fn is_owner(headers: &HeaderMap) -> bool {
    // Same predicate as routes::settings::is_owner. Duplicated to keep that
    // module's auth check private; if a third caller appears, lift this into
    // a shared helper.
    let host = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let hostname = host
        .split_once(':')
        .map(|(h, _)| h)
        .unwrap_or(&host)
        .trim_start_matches('[')
        .trim_end_matches(']');
    let is_loopback = hostname == "localhost" || hostname == "127.0.0.1" || hostname == "::1";
    let is_https = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|p| p.eq_ignore_ascii_case("https"))
        .unwrap_or(false);
    is_loopback || is_https
}

pub async fn setup_status(State(state): State<Arc<AppState>>) -> Response {
    let complete = is_setup_complete(&state);
    (
        StatusCode::OK,
        [("cache-control", "private, no-store")],
        Json(json!({
            "complete": complete,
            "integrations": {
                "tailscale": { "state": "not_configured" },
                "bluesky":   { "state": "not_configured" },
            },
        })),
    )
        .into_response()
}

#[derive(Deserialize, Default)]
pub struct CompleteBody {
    #[serde(default)]
    pub reset: bool,
}

pub async fn setup_complete(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<CompleteBody>>,
) -> Response {
    let body = body.map(|Json(b)| b).unwrap_or_default();
    let already_done = is_setup_complete(&state);

    // Re-running setup (or any call after first-boot) is owner-gated so
    // random LAN guests can't reset us back into the wizard.
    if already_done && !is_owner(&headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Not available to guests" })),
        )
            .into_response();
    }

    let mut current = read_overrides(&state);
    if body.reset {
        current.remove(SETUP_COMPLETE_KEY);
    } else {
        current.insert(SETUP_COMPLETE_KEY.to_string(), "true".to_string());
    }

    if let Err(e) = write_overrides(&state, &current) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Write failed: {e}") })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        [("cache-control", "private, no-store")],
        Json(json!({ "complete": !body.reset })),
    )
        .into_response()
}
