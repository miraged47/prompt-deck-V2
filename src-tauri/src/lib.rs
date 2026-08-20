// Prompt Deck — desktop shell
// Copyright (c) 2026 Mirac Cavdur. All rights reserved.
//
// The UI is the original single-file Prompt Deck HTML app, served from the
// bundled `ui/` folder. This Rust layer adds what a browser tab cannot do:
// a real window, offline-capable local storage, native file export, a CORS-free
// Anthropic proxy for the AI assistant, and signed auto-updates from GitHub.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

mod updater;

/// Payload pushed to the UI on the `pd://update` channel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// checking | available | none | downloading | installing | error
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// True when the user asked for the check explicitly (menu / button), so the
    /// UI knows whether to report "you are up to date".
    pub manual: bool,
}

impl UpdateStatus {
    fn new(state: &'static str, manual: bool) -> Self {
        Self { state, version: None, notes: None, percent: None, message: None, manual }
    }
}

pub fn emit_update_status(app: &AppHandle, status: UpdateStatus) {
    let _ = app.emit("pd://update", status);
}

/// Version of the running desktop build, e.g. "1.1.0".
#[tauri::command]
fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// The webview finished booting the UI — reveal the window.
#[tauri::command]
fn frontend_ready(app: AppHandle) {
    show_main_window(&app);
}

/// Diagnostics from the UI, printed only when PD_DIAG=1 so support questions
/// can be answered without a devtools session.
#[tauri::command]
fn diag(report: serde_json::Value) {
    if std::env::var("PD_DIAG").as_deref() == Ok("1") {
        println!("[pd-diag] {report}");
    }
}

/// Save a file through a native "Save as…" dialog.
///
/// `data` is base64 (binary-safe, since the UI exports both JSON and images).
/// Returns the chosen path, or `None` if the user cancelled.
#[tauri::command]
async fn save_file(
    app: AppHandle,
    default_name: String,
    data_base64: String,
) -> Result<Option<String>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use tauri_plugin_dialog::DialogExt;

    let bytes = STANDARD.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;

    let ext = std::path::Path::new(&default_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let chosen = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file().set_file_name(&default_name);
        if !ext.is_empty() {
            builder = builder.add_filter(ext.to_uppercase(), &[ext.as_str()]);
        }
        builder.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(path) = chosen else { return Ok(None) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Proxy for the AI Scene Assistant.
///
/// The webview cannot call api.anthropic.com directly (CORS), and routing it
/// through Rust also keeps the API key out of any page-level request logs.
#[tauri::command]
async fn anthropic_messages(
    app: AppHandle,
    api_key: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if api_key.trim().is_empty() {
        return Err("missing-api-key".into());
    }
    let client = app.state::<reqwest::Client>();
    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("content-type", "application/json")
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("read: {e}"))?;
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(json) => Ok(json),
        Err(_) if !status.is_success() => Err(format!("http {status}: {text}")),
        Err(e) => Err(format!("parse: {e}")),
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if !win.is_visible().unwrap_or(false) {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

pub fn run() {
    let http = reqwest::Client::builder()
        .user_agent(concat!("PromptDeck/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .expect("failed to build http client");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(http)
        .manage(updater::PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            frontend_ready,
            diag,
            save_file,
            anthropic_messages,
            updater::check_for_update,
            updater::install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            #[cfg(target_os = "macos")]
            install_menu(&handle);

            // Never leave the user staring at nothing if the UI fails to report in.
            let fallback = handle.clone();
            tauri::async_runtime::spawn(async move {
                sleep_ms(2500).await;
                show_main_window(&fallback);
            });

            // Quiet check a few seconds after launch, so a fresh release is
            // offered without the user having to look for it.
            let auto = handle.clone();
            tauri::async_runtime::spawn(async move {
                sleep_ms(4000).await;
                updater::run_check(auto, false).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Prompt Deck");
}

pub(crate) async fn sleep_ms(ms: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

/// macOS gets the standard app menu plus an explicit "Check for Updates…" entry.
#[cfg(target_os = "macos")]
fn install_menu(app: &AppHandle) {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};

    let build = || -> tauri::Result<()> {
        let menu = Menu::default(app)?;
        let check = MenuItem::with_id(app, "pd-check-updates", "Check for Updates…", true, None::<&str>)?;
        if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
            app_menu.insert(&check, 1)?;
        }
        app.set_menu(menu)?;
        Ok(())
    };
    if let Err(e) = build() {
        eprintln!("[prompt-deck] menu setup failed: {e}");
    }

    app.on_menu_event(|app, event| {
        if event.id() == "pd-check-updates" {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                updater::run_check(app, true).await;
            });
        }
    });
}
