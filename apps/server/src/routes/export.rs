use axum::extract::State;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::entry::Entry;
use crate::models::{new_id, now_rfc3339};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInput {
    #[serde(default = "default_format")]
    pub format: String,
    pub entry_ids: Option<Vec<String>>,
}

fn default_format() -> String {
    "json".to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_name: String,
    pub storage_path: String,
    pub format: String,
    pub count: usize,
    pub created_at: String,
}

/// POST /api/export - write selected (or all) entries to a file under
/// DATA_DIR/exports and return its metadata. Supports `json` and `markdown`.
pub async fn export(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<ExportInput>,
) -> AppResult<Json<ExportResult>> {
    let entries = state
        .storage
        .export_entries(&auth.id, input.entry_ids.as_deref())
        .await?;

    let format = if input.format == "markdown" { "markdown" } else { "json" };
    let stamp = now_rfc3339().replace(':', "-");
    let (ext, body) = match format {
        "markdown" => ("md", render_markdown(&entries)),
        _ => ("json", serde_json::to_string_pretty(&entries)?),
    };

    let file_name = format!("omnilog-export-{}-{}.{}", stamp, &new_id()[..8], ext);
    let storage_path = format!("exports/{file_name}");
    let abs_path = state.config.exports_dir().join(&file_name);
    tokio::fs::write(&abs_path, body).await?;

    Ok(Json(ExportResult {
        file_name,
        storage_path,
        format: format.to_string(),
        count: entries.len(),
        created_at: now_rfc3339(),
    }))
}

fn render_markdown(entries: &[Entry]) -> String {
    let mut out = String::from("# OmniLog Export\n\n");
    for e in entries {
        out.push_str(&format!(
            "## {}\n\n",
            if e.title.is_empty() { "(untitled)" } else { &e.title }
        ));
        out.push_str(&format!("*{}*", e.date));
        if !e.tags.is_empty() {
            out.push_str(&format!(" - tags: {}", e.tags.join(", ")));
        }
        out.push_str("\n\n");
        out.push_str(&e.content_text);
        out.push_str("\n\n---\n\n");
    }
    out
}
