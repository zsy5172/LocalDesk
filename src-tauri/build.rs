use std::fs;
use std::path::PathBuf;

// A tiny 1x1 transparent PNG. This is used as a build-time fallback to satisfy
// Tauri's `generate_context!()` icon lookup during dev builds.
const DEFAULT_ICON_PNG: &[u8] = &[
  // Signature + IHDR (RGBA) + IDAT + IEND
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x60, 0x00, 0x02, 0x00,
  0x00, 0x05, 0x00, 0x01, 0x7A, 0x5E, 0xAB, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
  0xAE, 0x42, 0x60, 0x82,
];

fn is_png_rgba(png: &[u8]) -> bool {
  const PNG_SIG: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
  // PNG signature (8) + length (4) + "IHDR" (4) + width (4) + height (4) + bit depth (1) + color type (1)
  const COLOR_TYPE_OFFSET: usize = 25;

  if png.len() <= COLOR_TYPE_OFFSET {
    return false;
  }
  if &png[0..8] != PNG_SIG {
    return false;
  }
  // color type 6 = RGBA
  png[COLOR_TYPE_OFFSET] == 0x06
}

fn ensure_default_icon() {
  let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is missing");
  let icon_path = PathBuf::from(manifest_dir).join("icons").join("icon.png");

  if icon_path.exists() {
    let bytes = fs::read(&icon_path)
      .unwrap_or_else(|error| panic!("[build] Failed to read icon {}: {error}", icon_path.display()));
    if is_png_rgba(&bytes) {
      return;
    }
    eprintln!(
      "[build] Existing icon is not RGBA; overwriting with a tiny default icon: {}",
      icon_path.display()
    );
  }

  let parent = icon_path
    .parent()
    .expect("[build] icon path has no parent dir");

  fs::create_dir_all(parent)
    .unwrap_or_else(|error| panic!("[build] Failed to create icons dir {}: {error}", parent.display()));

  fs::write(&icon_path, DEFAULT_ICON_PNG)
    .unwrap_or_else(|error| panic!("[build] Failed to write default icon {}: {error}", icon_path.display()));
}

fn set_git_info() {
  use std::process::Command;
  
  // Get full commit hash
  if let Ok(output) = Command::new("git").args(["rev-parse", "HEAD"]).output() {
    if output.status.success() {
      let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
      println!("cargo:rustc-env=GIT_COMMIT_HASH={}", hash);
      println!("cargo:rustc-env=GIT_COMMIT_SHORT={}", &hash[..7.min(hash.len())]);
    }
  }
  
  // Get build time
  let build_time = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
  println!("cargo:rustc-env=BUILD_TIME={}", build_time);

  // Prefer semantic version from git tag on HEAD (e.g. v1.2.3 or 1.2.3)
  if let Ok(output) = Command::new("git").args(["tag", "--points-at", "HEAD"]).output() {
    if output.status.success() {
      let stdout = String::from_utf8_lossy(&output.stdout);
      if let Some(version) = stdout
        .lines()
        .find_map(|line| normalize_tag_to_version(line.trim()))
      {
        println!("cargo:rustc-env=APP_VERSION={}", version);
      }
    }
  }
}

fn normalize_tag_to_version(tag: &str) -> Option<String> {
  let trimmed = tag.trim();
  if trimmed.is_empty() {
    return None;
  }

  let candidate = trimmed.strip_prefix('v').unwrap_or(trimmed);
  if is_semver_like(candidate) {
    return Some(candidate.to_string());
  }

  // Backward-compatible tags like `v0.0.9alpha2` -> `0.0.9-alpha2`
  if let Some(index) = candidate.find(|ch: char| ch.is_ascii_alphabetic()) {
    let (core, suffix) = candidate.split_at(index);
    if is_semver_core(core)
      && suffix.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '-')
    {
      return Some(format!("{}-{}", core, suffix));
    }
  }
  None
}

fn is_semver_like(version: &str) -> bool {
  if !is_semver_core(version.split(|ch| ch == '-' || ch == '+').next().unwrap_or("")) {
    return false;
  }
  version.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '+')
}

fn is_semver_core(core: &str) -> bool {
  let parts: Vec<&str> = core.split('.').collect();
  if parts.len() != 3 {
    return false;
  }
  !parts
    .iter()
    .any(|part| part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()))
}

fn main() {
  ensure_default_icon();
  set_git_info();
  tauri_build::build()
}
