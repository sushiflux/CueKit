#!/bin/bash
# Laeuft IM Docker-Container (gradle:8.10-jdk17), gestartet von scripts/android-build.ps1.
set -e
export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
if [ ! -d "$ANDROID_HOME/platforms/android-35" ]; then
  echo "== Android-SDK einrichten (nur beim ersten Mal) =="
  apt-get update -qq && apt-get install -y -qq unzip curl >/dev/null
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fsSL -o /tmp/cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q /tmp/cmdtools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
fi
cd /work/android
gradle --no-daemon -q :app:assembleDebug
