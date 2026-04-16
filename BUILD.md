# Building Habit Kingdom APK

This document explains how to build a standalone APK that runs without Metro bundler.

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

#### 2. Set JAVA_HOME
```cmd
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.11.9-hotspot"
```

#### 3. Install Android SDK
Download from https://developer.android.com/studio

#### 4. Set ANDROID_HOME
```cmd
set "ANDROID_HOME=C:\Users\YourUsername\AppData\Local\Android\Sdk"
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
- `android/gradle.properties` - Build properties (New Architecture enabled)
- `android/app/build.gradle` - App build configuration

---

## Release vs Debug Build

| Feature | Debug APK | Release APK |
|---------|-----------|-------------|
| JS Bundle | Not embedded | Embedded in APK |
| Metro Required | Yes | No |
| Optimization | None | Full optimization |
| Size | ~200MB | ~100MB |
| Signing | Debug keystore | Debug keystore |

For distribution, create a proper signing keystore and update `android/app/build.gradle` with your production credentials.

---

## Quick Build Commands

After initial setup, you can use these simplified commands:

```bash
# Build debug APK
npm run build:android:debug

# Build release APK
npm run build:android:release
```

These commands are defined in `package.json` under the scripts section.
