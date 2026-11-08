# MarketLens for Android

A small native app (Java, no libraries) that opens https://stocks.shekathali.com full-screen in a WebView.
Links to the site open in the app; other sites open in the browser; Back goes back within the site; an
offline screen offers Try again. Light and dark follow the phone's setting.

## Build

Needs JDK 17+, Gradle 8.9+, and an Android SDK with `platforms;android-35` and `build-tools;35.0.0`.

```sh
export ANDROID_HOME=/path/to/android-sdk
export ML_KEYSTORE=/path/to/marketlens-release.jks ML_KEY_ALIAS=marketlens ML_KEYSTORE_PASSWORD=...
gradle assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
```

Keep the release keystore safe and out of the repository: every update must be signed with the same key,
or Android refuses to install it over the existing app. Bump `versionCode` in `app/build.gradle` for each
release.
