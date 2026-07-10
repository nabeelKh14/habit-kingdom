#!/usr/bin/env bash
# Final QA release APK build for Habit Kingdom.
# Corrects stale BUILD.md: uses Java 17 (Homebrew), home Android SDK (has android-35),
# and overrides arch to arm64-v8a only (~39MB, ~10 min) for testing/distribution.
set -e

export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$(dirname "$0")/android"

echo "==> Java: $(java -version 2>&1 | head -1)"
echo "==> Android SDK: $ANDROID_HOME"

echo "==> Building release APK (arm64-v8a only)..."
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon

APK="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  echo "==> APK built: $APK"
  echo "==> Size: $(du -h "$APK" | cut -f1)"
  echo "==> Verifying JS bundle embedded..."
  unzip -l "$APK" | grep -i "assets/index.android.bundle" || echo "!! bundle NOT found"
  # Copy to project root with versioned name
  cp "$APK" "../habit-kingdom-v1.1.0-final.apk"
  echo "==> Copied to ../habit-kingdom-v1.1.0-final.apk"
else
  echo "!! APK not found — build failed"
  exit 1
fi
