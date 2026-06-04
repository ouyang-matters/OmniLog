use axum::extract::{Query, State};
use axum::{Extension, Json};
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::entry::Entry;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

/// GET /api/search?q=keyword - case-insensitive match across the caller's own
/// entries (title, body text and tags), regardless of folder.
pub async fn search(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Query(params): Query<SearchQuery>,
) -> AppResult<Json<Vec<Entry>>> {
    let q = params.q.trim();
    if q.is_empty() {
        return Ok(Json(vec![]));
    }
    let entries = state.storage.search_entries(&auth.id, q).await?;
    Ok(Json(entries))
}
