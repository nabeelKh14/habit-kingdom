# Building Habit Kingdom APK

This document explains how to build standalone APKs for Android.

## Quick Summary

| APK Type | Metro Required | JS Bundle | Size | Build Time | Use Case |
|----------|---------------|-----------|------|------------|----------|
| **Release (Optimized)** | ❌ No | ✅ Embedded | ~39MB | ~10 min | **Recommended** - Works standalone |
| Release (All arch) | ❌ No | ✅ Embedded | ~100MB | ~40 min | If supporting older devices |
| Debug | ✅ Yes | ❌ Not embedded | ~200MB | ~5 min | Development only |

**For testing/distribution: Always use the Optimized Release APK (arm64-v8a only).**

### 🚀 Quickest Build (Windows)
```powershell
$env:JAVA_HOME="C:\Program Files\Java\jdk-17"
cd D:\kh\android
.\gradlew.bat assembleRelease --no-daemon
```
Output: `D:\kh\android\app\build\outputs\apk\release\app-release.apk`

---

## Fast Build Commands

### Quick Build (Windows - Recommended)
```powershell
$env:JAVA_HOME="C:\Program Files\Java\jdk-17"
cd android
.\gradlew.bat assembleRelease --no-daemon
```
**Output:** `android\app\build\outputs\apk\release\app-release.apk` (~39 MB)

### Copy to Project Root
```powershell
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" -Destination "kidhabit-release.apk"
```

---

## Build Optimization Tips

### Current Optimizations (Applied)
| Optimization | Impact | Status |
|--------------|--------|--------|
| Build only arm64-v8a (drops armeabi-v7a, x86, x86_64) | **~75% faster** (~10 min vs ~40 min) | ✅ Configured |
| Gradle build cache enabled | Reuses cached task outputs | ✅ Enabled |
| Configuration cache enabled | Skips config phase when unchanged | ✅ Enabled |
| Parallel builds enabled | Uses multiple CPU cores | ✅ Enabled |
| PNG crunching disabled | Skips image optimization | ✅ Enabled |

### Build Speed Tips
| Tip | Impact |
|-----|--------|
| **Don't run `gradlew clean`** unless necessary (causes full rebuild) | Avoids +30 min |
| **Close other apps** to free RAM (prevents swapping) | Prevents slowdowns |
| **Use `--no-daemon`** flag to avoid daemon issues | Stable builds |
| **Only rebuild when JS/native code changes** (pure asset changes don't need rebuild) | Saves time |
| **Increment `versionCode`** in `android/app/build.gradle` for new builds | Best practice |

### Architecture Note
The build is configured to target **arm64-v8a only** (line 41 in `gradle.properties` + `abiFilters` in `app/build.gradle`). This covers **95%+ of modern Android devices** (2017+).

To build for all architectures (if needed for older devices):
```powershell
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86,x86_64 --no-daemon
```

### First Build vs Subsequent Builds
- **First build after clean:** ~10-15 minutes (compiles native modules)
- **Subsequent builds (JS changes only):** ~2-3 minutes (incremental)
- **No changes:** ~10 seconds (cached)

---

## Debug Build (Requires Metro)
```powershell
cd android
.\gradlew.bat assembleDebug --no-daemon
```
**Note:** Debug APKs require Metro bundler running. JS bundle is NOT embedded.

## Prerequisites

- **Node.js** - Required for npm commands
- **Java Development Kit (JDK)** - Java 17 required for Gradle 9.0
- **Android SDK** - For building Android apps

---

## Environment Setup

### macOS Setup

#### 1. Install Java 17
```bash
brew install openjdk@17
```

#### 2. Install Android SDK Command Line Tools
```bash
mkdir -p ~/Library/Android/sdk/cmdline-tools
cd ~/Library/Android/sdk/cmdline-tools
curl -L -o cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
unzip cmdline-tools.zip
mv cmdline-tools latest
```

#### 3. Install Required SDK Components
```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

#### 4. Set Environment Variables
Add to `~/.zshrc`:
```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Then run:
```bash
source ~/.zshrc
```

---

### Windows Setup

#### 1. Install Java 17
Download from https://adoptium.net/temurin/releases/?version=17
- **Or use Oracle JDK:** https://www.oracle.com/java/technologies/downloads/#java17

#### 2. Set JAVA_HOME (Choose your installation path)
```powershell
# If using Oracle JDK (recommended - path used in this project):
$env:JAVA_HOME="C:\Program Files\Java\jdk-17"

# If using Eclipse Adoptium:
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot"
```

#### 3. Install Android SDK
Download Android Studio from https://developer.android.com/studio (includes SDK)

#### 4. Set ANDROID_HOME
```powershell
$env:ANDROID_HOME="C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
```

**Verify setup:**
```powershell
java -version
adb version
```

---

### Project Dependencies

Install npm dependencies:
```bash
npm install
```

---

## Build Commands

### Debug APK (requires Metro)

**macOS:**
```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk
cd android && ./gradlew assembleDebug
```

**Windows:**
```cmd
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot"
cd android && gradlew.bat assembleDebug
```

**Note:** Debug APKs require Metro bundler to be running. The JS bundle is NOT embedded.

---

### Release APK (standalone - recommended)

**macOS:**
```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME=~/Library/Android/sdk
cd android && ./gradlew assembleRelease
```

**Windows:**
```cmd
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot"
cd android && gradlew.bat assembleRelease
```

**Note:** Release APKs embed the JavaScript bundle into the APK. The app runs standalone without Metro.

---

## Build Output

After building, the APK is located at:

- **Debug APK:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK:** `android/app/build/outputs/apk/release/app-release.apk`

---

## Verifying the Build

To verify the JS bundle is embedded in the APK:

**macOS/Linux:**
```bash
unzip -l android/app/build/outputs/apk/release/app-release.apk | grep -i bundle
```

**Windows (PowerShell):**
```powershell
Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('android\app\build\outputs\apk\release\app-release.apk')
$zip.Entries | Where-Object { $_.FullName -like '*bundle*' } | ForEach-Object { $_.FullName }
$zip.Dispose()
```

Expected output: `assets/index.android.bundle`

---

## Troubleshooting

### Java Version Error

If you see errors about incompatible Java versions:
- Ensure JAVA_HOME points to Java 17
- Check Java version: `java -version`

### Gradle Daemon Issues

The `--no-daemon` flag prevents Gradle daemon issues. If builds fail, try:

**macOS:**
```bash
cd android && ./gradlew clean
```

**Windows:**
```cmd
cd android && gradlew.bat clean
```

### Android SDK Issues

Ensure Android SDK is installed and `ANDROID_HOME` is set:
```bash
# Verify SDK
echo $ANDROID_HOME
ls $ANDROID_HOME
```

---

## Key Configuration Files

- `android/gradle/wrapper/gradle-wrapper.properties` - Gradle version (9.0)
- `android/gradle.properties` - Build properties (New Architecture enabled, `reactNativeArchitectures=arm64-v8a`)
- `android/app/build.gradle` - App build configuration (includes `abiFilters "arm64-v8a"` in `defaultConfig`)

### Configuration Applied (for fast builds)

**`android/gradle.properties` (line 41):**
```
reactNativeArchitectures=arm64-v8a
```

**`android/app/build.gradle` (in `defaultConfig`):**
```groovy
ndk { abiFilters "arm64-v8a" }
```

This restricts native builds to arm64-v8a only (covers 95%+ of modern devices), cutting build time by ~75%.

---

## APK Types Explained

| Feature | Debug APK | Release APK |
|---------|-----------|-------------|
| JS Bundle | Not embedded | **Embedded** ✅ |
| Metro Required | Yes | **No** ✅ |
| Optimization | None | Full optimization |
| Size | ~200MB | ~100MB |
| Signing | Debug keystore | Debug keystore |

### Why Release APK is Better

- ✅ **Works without Metro** - Install on any Android device
- ✅ **Smaller size** - ~100MB vs ~200MB
- ✅ **Optimized** - Better performance
- ✅ **Production-ready** - Can be distributed

### Signing

The release APK is currently signed with the debug keystore. For production distribution, create a proper signing keystore and update `android/app/build.gradle`.
