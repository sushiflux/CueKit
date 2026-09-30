package com.sushiflux.deck

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.common.InputImage
import org.json.JSONObject

/**
 * Schlanke Huelle um die CueKit-Oberflaeche des PCs: Der Startbildschirm (assets/connect) bietet drei Wege zur Kopplung
 * (QR-Code scannen, QR-Code aus einem Bild, Adresse + Code eintippen); danach laedt die App die Oberflaeche des PCs
 * im Vollbild. Die gekoppelte Adresse wird gemerkt, das Geraete-Token liegt im Speicher der WebView.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("deck", MODE_PRIVATE) }

    /** Nur auf der gebuendelten Startseite duerfen die Scan-/Verbindungs-Funktionen der Bruecke benutzt werden. */
    @Volatile private var onLocalPage = false

    private val pickImage = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) callJs("onCancel()") else decodeImage(uri)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // als Tastenfeld soll der Bildschirm anbleiben
        WindowCompat.setDecorFitsSystemWindows(window, false)
        hideSystemBars()

        web = WebView(this).apply {
            setBackgroundColor(0xFF0B0D12.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                setSupportZoom(false)
                builtInZoomControls = false
                userAgentString = "$userAgentString CueKitApp/${BuildConfig.VERSION_NAME}"
            }
            addJavascriptInterface(Bridge(), "CueKitApp")
            webViewClient = Client()
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (onLocalPage) finish() else showMenu()
            }
        })

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            val base = prefs.getString("base", null)
            if (base != null) web.loadUrl("$base/") else loadConnectPage()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun loadConnectPage(error: String? = null, retry: Boolean = false) {
        val query = buildList {
            if (error != null) add("error=" + Uri.encode(error))
            if (retry) add("retry=1")
        }.joinToString("&")
        web.loadUrl("file:///android_asset/connect/index.html" + if (query.isEmpty()) "" else "?$query")
    }

    private fun callJs(call: String) = runOnUiThread { web.evaluateJavascript("window.cuekit && window.cuekit.$call", null) }

    private fun jsString(text: String): String = JSONObject.quote(text)

    private fun fail(message: String) = callJs("onError(${jsString(message)})")

    // ---------------------------------------------------------------- Kopplung

    /** QR-Inhalt oder eingefuegter Link: "http://<Adresse>:<Port>/pair?code=XXXXXXXX". */
    private fun handleScanned(raw: String?) {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return fail("Im Bild wurde kein QR-Code gefunden.")
        val uri = runCatching { Uri.parse(text) }.getOrNull()
        val code = uri?.getQueryParameter("code")
        if (uri == null || uri.host.isNullOrEmpty() || code.isNullOrBlank() || uri.scheme !in listOf("http", "https"))
            return fail("Das ist kein CueKit-Kopplungscode. Scanne den QR-Code unter „Geräte → Gerät koppeln“ auf dem PC.")
        val port = if (uri.port > 0) ":${uri.port}" else ""
        startPairing("${uri.scheme}://${uri.host}$port", code)
    }

    /** Manuelle Eingabe: Adresse ("192.168.178.20:5202", auch mit http://) plus Code. */
    private fun handleManual(address: String, code: String) {
        val cleanCode = code.filter { it.isLetterOrDigit() }
        if (cleanCode.length < 6) return fail("Der Code ist zu kurz – er steht unter dem QR-Code (z. B. ABCD-EFGH).")
        val host = address.trim().removePrefix("http://").removePrefix("https://").trimEnd('/').substringBefore('/')
        if (host.isEmpty() || !Regex("^[A-Za-z0-9._\\-\\[\\]:]+$").matches(host))
            return fail("Die Adresse des PCs fehlt oder ist ungültig – z. B. 192.168.178.20:5202.")
        val withPort = if (Regex(":\\d{1,5}$").containsMatchIn(host)) host else "$host:5202"
        startPairing("http://$withPort", cleanCode)
    }

    private fun startPairing(base: String, code: String) {
        prefs.edit().putString("base", base).apply()
        web.loadUrl("$base/pair?code=" + Uri.encode(code))
    }

    private fun decodeImage(uri: Uri) {
        val image = runCatching { InputImage.fromFilePath(this, uri) }.getOrElse {
            return fail("Das Bild konnte nicht gelesen werden: ${it.message ?: "unbekannter Fehler"}")
        }
        val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
        scanner.process(image)
            .addOnSuccessListener { codes -> handleScanned(codes.firstNotNullOfOrNull { it.rawValue }) }
            .addOnFailureListener { fail("Das Bild konnte nicht ausgewertet werden: ${it.message ?: "unbekannter Fehler"}") }
    }

    private fun scanWithCamera() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { handleScanned(it.rawValue) }
            .addOnCanceledListener { callJs("onCancel()") }
            .addOnFailureListener {
                fail("Der Kamera-Scanner ist nicht verfügbar (${it.message ?: "Google Play-Dienste fehlen oder sind veraltet"}). Nutze „QR-Code aus Bild“ oder tippe Adresse und Code ein.")
            }
    }

    private fun showMenu() {
        AlertDialog.Builder(this)
            .setTitle(BuildConfig.PRODUCT)
            .setItems(arrayOf("Mit anderem PC verbinden", "App schließen")) { _, which ->
                if (which == 0) {
                    prefs.edit().remove("base").apply()
                    loadConnectPage()
                } else finish()
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    // ---------------------------------------------------------------- Bruecke zur Startseite

    private inner class Bridge {
        @JavascriptInterface
        fun info(): String = JSONObject()
            .put("name", BuildConfig.PRODUCT).put("tagline", BuildConfig.TAGLINE)
            .put("company", BuildConfig.COMPANY).put("version", BuildConfig.VERSION_NAME)
            .put("savedBase", prefs.getString("base", "") ?: "")
            .toString()

        @JavascriptInterface
        fun scan() { if (onLocalPage) runOnUiThread { scanWithCamera() } }

        @JavascriptInterface
        fun pickImage() {
            if (onLocalPage) runOnUiThread { pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
        }

        @JavascriptInterface
        fun connect(address: String, code: String) { if (onLocalPage) runOnUiThread { handleManual(address, code) } }

        @JavascriptInterface
        fun retry() {
            if (!onLocalPage) return
            runOnUiThread { prefs.getString("base", null)?.let { web.loadUrl("$it/") } }
        }

        @JavascriptInterface
        fun forget() {
            if (!onLocalPage) return
            runOnUiThread { prefs.edit().remove("base").apply(); loadConnectPage() }
        }
    }

    private inner class Client : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            onLocalPage = url.startsWith("file:///android_asset/")
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.scheme == "file") return false
            val base = prefs.getString("base", null)?.let(Uri::parse)
            if (base != null && url.host == base.host && url.port == base.port) return false
            // Fremde Adressen (Links in der Oberflaeche) im Browser oeffnen, nicht in der Hülle.
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame || request.url.scheme == "file") return
            val host = request.url.authority ?: request.url.host ?: "dem PC"
            loadConnectPage("$host ist nicht erreichbar (${error.description}). Läuft ${BuildConfig.PRODUCT} auf dem PC, und ist das Handy im selben WLAN?", retry = true)
        }
    }
}
