use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::state::AppState;

const SETTING_VERSIONING: &str = "versioning.enabled";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub versioning_enabled: bool,
}

async fn read_settings(state: &AppState) -> AppResult<Settings> {
    let versioning_enabled = state
        .storage
        .get_setting(SETTING_VERSIONING)
        .await?
        .map(|v| v != "false")
        .unwrap_or(true);
    Ok(Settings { versioning_enabled })
}

/// GET /api/settings
pub async fn get(State(state): State<AppState>) -> AppResult<Json<Settings>> {
    Ok(Json(read_settings(&state).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
    pub versioning_enabled: Option<bool>,
}

/// PATCH /api/settings
pub async fn update(
    State(state): State<AppState>,
    Json(input): Json<UpdateSettings>,
) -> AppResult<Json<Settings>> {
    if let Some(enabled) = input.versioning_enabled {
        state
            .storage
            .set_setting(SETTING_VERSIONING, if enabled { "true" } else { "false" })
            .await?;
    }
    Ok(Json(read_settings(&state).await?))
}
