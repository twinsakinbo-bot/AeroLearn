use tauri::Manager;
use std::fs;
use std::path::PathBuf;

fn get_onboarding_flag_path(app: &tauri::AppHandle) -> PathBuf {
    let app_data = app.path().app_data_dir().expect("Failed to get app data dir");
    fs::create_dir_all(&app_data).ok();
    app_data.join("onboarding_complete")
}

fn is_onboarding_complete(app: &tauri::AppHandle) -> bool {
    get_onboarding_flag_path(app).exists()
}

fn mark_onboarding_complete(app: &tauri::AppHandle) {
    let path = get_onboarding_flag_path(app);
    fs::write(path, "true").ok();
}

#[tauri::command]
fn complete_onboarding(app: tauri::AppHandle, window: tauri::WebviewWindow) {
    mark_onboarding_complete(&app);
    // Navigate to the live AeroLearn website
    let _ = window.navigate("https://aerolearn.name.ng/auth/login".parse().unwrap());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![complete_onboarding])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();

            if is_onboarding_complete(&app.handle()) {
                // Skip onboarding, go straight to the app
                let _ = main_window.navigate("https://aerolearn.name.ng/auth/login".parse().unwrap());
            }
            // Otherwise, the default frontendDist (onboarding page) is loaded

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
