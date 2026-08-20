// Signed auto-updates.
//
// Releases are published to GitHub with `latest.json` + minisign signatures
// (see .github/workflows/release.yml). The updater only installs a bundle whose
// signature matches the public key baked into tauri.conf.json, so a hijacked
// download cannot ship code to anyone running Prompt Deck.

use crate::{emit_update_status, UpdateStatus};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update found by the last check, kept so "Install" does not have to
/// re-download the manifest.
#[derive(Default)]
pub struct PendingUpdate(pub tauri::async_runtime::Mutex<Option<Update>>);

/// True while the release endpoint still has the placeholder from the template.
fn endpoint_configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|e| e.as_str())
                .any(|e| !e.contains("__GH_OWNER__") && !e.contains("__GH_REPO__"))
        })
        .unwrap_or(false)
}

/// Check GitHub for a newer release and tell the UI what happened.
pub async fn run_check(app: AppHandle, manual: bool) {
    if !endpoint_configured(&app) {
        if manual {
            let mut s = UpdateStatus::new("error", manual);
            s.message = Some(
                "Update server is not configured yet — set your GitHub repo in tauri.conf.json."
                    .into(),
            );
            emit_update_status(&app, s);
        }
        return;
    }

    emit_update_status(&app, UpdateStatus::new("checking", manual));

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            let mut s = UpdateStatus::new("error", manual);
            s.message = Some(e.to_string());
            emit_update_status(&app, s);
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let mut s = UpdateStatus::new("available", manual);
            s.version = Some(update.version.clone());
            s.notes = update.body.clone();
            {
                let pending = app.state::<PendingUpdate>();
                *pending.0.lock().await = Some(update);
            }
            emit_update_status(&app, s);
        }
        Ok(None) => emit_update_status(&app, UpdateStatus::new("none", manual)),
        Err(e) => {
            let mut s = UpdateStatus::new("error", manual);
            s.message = Some(friendly_error(&e));
            emit_update_status(&app, s);
        }
    }
}

fn friendly_error(e: &tauri_plugin_updater::Error) -> String {
    let raw = e.to_string();
    if raw.contains("404") || raw.to_lowercase().contains("not found") {
        "No published release found yet.".into()
    } else if raw.to_lowercase().contains("dns")
        || raw.to_lowercase().contains("connect")
        || raw.to_lowercase().contains("timed out")
    {
        "No internet connection.".into()
    } else {
        raw
    }
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) {
    run_check(app, true).await;
}

/// Download and install the update found by the last check, then relaunch.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let pending = app.state::<PendingUpdate>();
    let guard = pending.0.lock().await;
    let Some(update) = guard.as_ref() else {
        return Err("no-pending-update".into());
    };

    emit_update_status(&app, {
        let mut s = UpdateStatus::new("downloading", true);
        s.percent = Some(0.0);
        s.version = Some(update.version.clone());
        s
    });

    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_emitted = -1i64;

    let result = update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let percent = match total {
                    Some(total) if total > 0 => (downloaded as f64 / total as f64) * 100.0,
                    _ => -1.0,
                };
                // Emit at most once per whole percent — the webview does not
                // need thousands of IPC messages per download.
                let step = percent.floor() as i64;
                if percent < 0.0 || step > last_emitted {
                    last_emitted = step;
                    let mut s = UpdateStatus::new("downloading", true);
                    s.percent = if percent < 0.0 { None } else { Some(percent) };
                    emit_update_status(&progress_app, s);
                }
            },
            || {},
        )
        .await;

    match result {
        Ok(()) => {
            emit_update_status(&app, UpdateStatus::new("installing", true));
            // Give the webview a moment to paint the final state, then relaunch
            // into the freshly installed version.
            let restart = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::sleep_ms(600).await;
                restart.restart();
            });
            Ok(())
        }
        Err(e) => {
            let mut s = UpdateStatus::new("error", true);
            s.message = Some(friendly_error(&e));
            emit_update_status(&app, s);
            Err(e.to_string())
        }
    }
}
