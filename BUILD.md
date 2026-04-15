# Building KidHabit APK

This document explains how to build a standalone APK that runs without Metro bundler.

## Prerequisites

- **Node.js** - Required for npm commands
- **Java Development Kit (JDK)** - Java 17 required for Gradle 9.0
- **Android SDK** - For building Android apps

## Environment Setup

### Java Configuration

The project requires **Java 17** (not Java 25 which is incompatible with Gradle 9.0).

Set the `JAVA_HOME` environment variable:

```cmd
set "JAVA_HOME=C:\Program Files\Java\jdk-17"
```

Or add it permanently to system PATH:
1. Open System Properties → Environment Variables
2. Add new system variable: `JAVA_HOME` = `C:\Program Files\Java\jdk-17`

### Project Dependencies

Install npm dependencies:

```bash
npm install
```

## Build Commands

### Debug APK (requires Metro)

```cmd
set "JAVA_HOME=C:\Program Files\Java\jdk-17" && cd android && gradlew.bat assembleDebug --no-daemon
```

**Note:** Debug APKs require Metro bundler to be running. The JS bundle is NOT embedded.

### Release APK (standalone - recommended)

```cmd
set "JAVA_HOME=C:\Program Files\Java\jdk-17" && cd android && gradlew.bat assembleRelease --no-daemon
```

**Note:** Release APKs embed the JavaScript bundle into the APK. The app runs standalone without Metro.

## Build Output

After building, the APK is located at:

- **Debug APK:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK:** `android/app/build/outputs/apk/release/app-release.apk`

A copy is also saved to the project root as `kidhabit-release.apk`.

## Verifying the Build

To verify the JS bundle is embedded in the APK:

```powershell
powershell -command "Add-Type -Assembly System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead('android\app\build\outputs\apk\release\app-release.apk'); $zip.Entries | Where-Object { $_.FullName -like '*bundle*' } | ForEach-Object { $_.FullName }; $zip.Dispose()"
```

Expected output: `assets/index.android.bundle`

## Troubleshooting

### Java Version Error

If you see errors about incompatible Java versions:
- Ensure JAVA_HOME points to Java 17
- Check Java version: `java -version`

### Gradle Daemon Issues

The `--no-daemon` flag prevents Gradle daemon issues. If builds fail, try:
```cmd
cd android && gradlew.bat clean
```

### Android SDK Issues

Ensure Android SDK is installed and `ANDROID_HOME` is set:
```cmd
set "ANDROID_HOME=C:\Users\YourUsername\AppData\Local\Android\Sdk"
```

## Key Configuration Files

- `android/gradle/wrapper/gradle-wrapper.properties` - Gradle version (9.0)
- `android/gradle.properties` - Build properties (New Architecture enabled)
- `android/app/build.gradle` - App build configuration

## Release vs Debug Build

| Feature | Debug APK | Release APK |
|---------|-----------|-------------|
| JS Bundle | Not embedded | Embedded in APK |
| Metro Required | Yes | No |
| Optimization | None | Full optimization |
| Size | Smaller | Larger (~97MB) |
| Signing | Debug keystore | Debug keystore |

For distribution, create a proper signing keystore and update `android/app/build.gradle` with your production credentials.
