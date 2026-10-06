import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Name, Firma und Version kommen aus den Quellen der Wahrheit im Repo: branding.json / version.txt.
val repoRoot = rootDir.parentFile
@Suppress("UNCHECKED_CAST")
val brand = JsonSlurper().parse(File(repoRoot, "branding.json")) as Map<String, Any?>
val versionName0 = File(repoRoot, "version.txt").readText().trim().removePrefix("v") // z.B. 2026.10.10
val versionParts = versionName0.split(".").map { it.toInt() }

android {
    namespace = "com.sushiflux.deck"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sushiflux.deck"
        minSdk = 26
        targetSdk = 35
        versionCode = versionParts[0] * 100_000 + versionParts[1] * 1_000 + versionParts[2]
        versionName = versionName0
        resValue("string", "app_name", brand["productName"] as String)
        buildConfigField("String", "PRODUCT", "\"${brand["productName"]}\"")
        buildConfigField("String", "TAGLINE", "\"${brand["tagline"]}\"")
        buildConfigField("String", "COMPANY", "\"${brand["company"]}\"")
        // Webadresse der Produktseite (leer, solange es keine gibt) - wird nur als Text angezeigt, nie als Kauf-Link
        buildConfigField("String", "WEBSITE", "\"${brand["website"] ?: ""}\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/brand"))
}

// Logo wird aus branding/ uebernommen (kanonische Quelle), nicht doppelt gepflegt.
val copyBrand by tasks.registering(Copy::class) {
    from(File(repoRoot, "branding/logo.svg"))
    into(layout.buildDirectory.dir("generated/brand/connect"))
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach { dependsOn(copyBrand) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    // Kamera-Scanner von Google (eigene Oberflaeche, braucht keine Kamera-Berechtigung in der App)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // QR-Code aus einer Bilddatei lesen (Modell in der App enthalten, laeuft offline)
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
}
