package expo.modules.xraycore

import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

class XrayCoreModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("XrayCore")

    Events("onVpnStateChanged", "onCoreDownloadProgress")

    OnCreate {
      XrayVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
      }
      CoreVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
      }
      LibCoreVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
      }
    }

    OnDestroy {
      XrayVpnService.stateListener = null
      CoreVpnService.stateListener = null
      LibCoreVpnService.stateListener = null
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (VpnService.prepare(activity) == null) {
        promise.resolve(true)
        return@AsyncFunction
      }
      GhostVpnPermissionActivity.request(activity) { granted ->
        promise.resolve(granted)
      }
    }

    AsyncFunction("startVpn") { configJson: String, allowedJson: String?, disallowedJson: String?, promise: Promise ->
      if (XrayVpnService.isRunning.get()) {
        promise.reject("ERR_RUNNING", "VPN уже запущен", null)
        return@AsyncFunction
      }
      XrayVpnService.pendingPromise = promise
      val intent = Intent(context, XrayVpnService::class.java).apply {
        action = XrayVpnService.ACTION_START
        putExtra("config", configJson)
        if (!allowedJson.isNullOrBlank()) putExtra("allowed", allowedJson)
        if (!disallowedJson.isNullOrBlank()) putExtra("disallowed", disallowedJson)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Throwable) {
        XrayVpnService.pendingPromise = null
        promise.reject("ERR_START", e.message ?: "Не удалось запустить VPN-сервис", e)
      }
    }

    AsyncFunction("getInstalledApps") { includeSystem: Boolean, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-apps-list") {
        try {
          val pm = context.packageManager
          val self = context.packageName
          val apps = mutableListOf<Map<String, Any>>()
          for (info in pm.getInstalledPackages(0)) {
            val pkg = info.packageName
            if (pkg == self) continue
            val ai = info.applicationInfo ?: continue
            val isSystem = (ai.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 ||
              (ai.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            if (!includeSystem && isSystem) continue
            apps.add(
              mapOf(
                "packageName" to pkg,
                "appName" to (ai.loadLabel(pm)?.toString() ?: pkg),
                "system" to isSystem
              )
            )
          }
          apps.sortBy { (it["appName"] as String).lowercase() }
          promise.resolve(apps)
        } catch (e: Throwable) {
          promise.reject("ERR_APPS", e.message ?: "Не удалось получить список приложений", e)
        }
      }
    }

    Function("stopVpn") {
      val intent = Intent(context, XrayVpnService::class.java).apply {
        action = XrayVpnService.ACTION_STOP
      }
      context.startService(intent)
    }

    Function("isVpnRunning") {
      XrayVpnService.isRunning.get() || CoreVpnService.isRunning.get()
    }

    // ---- Синхронные настройки (SharedPreferences) ----

    Function("getSetting") { key: String ->
      val prefs = context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE)
      prefs.getString(key, null)
    }

    Function("setSetting") { key: String, value: String ->
      val prefs = context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE)
      prefs.edit().putString(key, value).apply()
    }

    // ---- Внешние ядра (sing-box) ----

    AsyncFunction("startCoreVpn") { coreName: String, configJson: String, allowedJson: String?, disallowedJson: String?, promise: Promise ->
      if (XrayVpnService.isRunning.get()) {
        promise.reject("ERR_RUNNING", "Сначала остановите VPN на ядре Xray", null)
        return@AsyncFunction
      }
      if (CoreVpnService.isRunning.get()) {
        promise.reject("ERR_RUNNING", "VPN уже запущен", null)
        return@AsyncFunction
      }
      val binary = CoreVpnService.coreBinaryPath(context, coreName)
      if (!binary.exists()) {
        promise.reject("ERR_NO_CORE", "Ядро $coreName не установлено", null)
        return@AsyncFunction
      }
      CoreVpnService.pendingPromise = promise
      val intent = Intent(context, CoreVpnService::class.java).apply {
        action = CoreVpnService.ACTION_START
        putExtra("core", coreName)
        putExtra("config", configJson)
        if (!allowedJson.isNullOrBlank()) putExtra("allowed", allowedJson)
        if (!disallowedJson.isNullOrBlank()) putExtra("disallowed", disallowedJson)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Throwable) {
        CoreVpnService.pendingPromise = null
        promise.reject("ERR_START", e.message ?: "Не удалось запустить VPN-сервис", e)
      }
    }

    Function("stopCoreVpn") {
      val intent = Intent(context, CoreVpnService::class.java).apply {
        action = CoreVpnService.ACTION_STOP
      }
      context.startService(intent)
    }

    Function("isCoreRunning") {
      CoreVpnService.isRunning.get()
    }

    AsyncFunction("getCoreVersion") { coreName: String, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-core-version") {
        try {
          val binary = CoreVpnService.coreBinaryPath(context, coreName)
          if (!binary.exists()) {
            promise.resolve("")
            return@thread
          }
          val proc = ProcessBuilder(binary.absolutePath, "version").start()
          val output = proc.inputStream.bufferedReader().use { it.readLine() ?: "" }
          proc.waitFor()
          promise.resolve(output.trim())
        } catch (e: Throwable) {
          promise.resolve("")
        }
      }
    }

    // ---- Загрузка ядер из репозитория (mihomo) ----

    Function("getCpuAbi") {
      Build.SUPPORTED_ABIS.firstOrNull() ?: ""
    }

    // Кэш иконок приложений (packageName -> base64 PNG)
    val appIconCache = java.util.concurrent.ConcurrentHashMap<String, String>()

    AsyncFunction("getAppIcon") { packageName: String, promise: Promise ->
      appIconCache[packageName]?.let {
        promise.resolve(it)
        return@AsyncFunction
      }
      kotlin.concurrent.thread(name = "gc-app-icon") {
        try {
          val pm = context.packageManager
          val drawable = pm.getApplicationIcon(packageName)
          val size = 96
          val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
          val canvas = android.graphics.Canvas(bmp)
          drawable.setBounds(0, 0, size, size)
          drawable.draw(canvas)
          val out = java.io.ByteArrayOutputStream()
          bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, out)
          bmp.recycle()
          val b64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
          appIconCache[packageName] = b64
          promise.resolve(b64)
        } catch (e: Throwable) {
          promise.resolve(null)
        }
      }
    }

    Function("getCoreStatus") { name: String ->
      val file = File(context.filesDir, "cores/$name")
      mapOf(
        "downloaded" to file.exists(),
        "size" to (if (file.exists()) file.length() else 0L),
        "path" to file.absolutePath
      )
    }

    AsyncFunction("downloadCore") { name: String, url: String, expectedSha256: String, expectedSize: Double, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-core-download") {
        try {
          val dir = File(context.filesDir, "cores")
          if (!dir.exists()) dir.mkdirs()
          val tmp = File(dir, "$name.tmp")
          val dest = File(dir, name)

          val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
          conn.instanceFollowRedirects = true
          conn.connectTimeout = 20000
          conn.readTimeout = 60000
          conn.setRequestProperty("User-Agent", "GhostCloud-Android")
          conn.connect()
          if (conn.responseCode !in 200..299) {
            throw IllegalStateException("HTTP ${conn.responseCode}")
          }
          val total = (conn.contentLengthLong.takeIf { it > 0 }) ?: expectedSize.toLong()
          val digest = java.security.MessageDigest.getInstance("SHA-256")
          var received = 0L
          var lastPct = -1
          conn.inputStream.use { input ->
            tmp.outputStream().use { output ->
              val buf = ByteArray(256 * 1024)
              while (true) {
                val read = input.read(buf)
                if (read < 0) break
                output.write(buf, 0, read)
                digest.update(buf, 0, read)
                received += read
                if (total > 0) {
                  val pct = (received * 100 / total).toInt()
                  if (pct != lastPct) {
                    lastPct = pct
                    sendEvent(
                      "onCoreDownloadProgress",
                      mapOf("name" to name, "received" to received, "total" to total, "progress" to pct)
                    )
                  }
                }
              }
            }
          }
          conn.disconnect()

          if (expectedSize > 0 && received != expectedSize.toLong()) {
            tmp.delete()
            throw IllegalStateException("Размер файла не совпадает: $received != ${expectedSize.toLong()}")
          }
          val hash = digest.digest().joinToString("") { "%02x".format(it) }
          if (!expectedSha256.isBlank() && !hash.equals(expectedSha256, ignoreCase = true)) {
            tmp.delete()
            throw IllegalStateException("Контрольная сумма не совпадает")
          }
          tmp.renameTo(dest)
          // делаем читаемым для System.load
          dest.setReadable(true)
          sendEvent("onCoreDownloadProgress", mapOf("name" to name, "received" to received, "total" to total, "progress" to 100))
          promise.resolve(dest.absolutePath)
        } catch (e: Throwable) {
          promise.reject("ERR_DOWNLOAD", e.message ?: "Ошибка загрузки ядра", e)
        }
      }
    }

    AsyncFunction("deleteCore") { name: String, promise: Promise ->
      val file = File(context.filesDir, "cores/$name")
      promise.resolve(if (file.exists()) file.delete() else false)
    }

    AsyncFunction("loadLibCore") { lib: String, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-libcore-load") {
        try {
          val fileName = if (lib == "singbox") "libsingbox.so" else "libclash.so"
          val file = File(context.filesDir, "cores/$fileName")
          if (!file.exists()) {
            promise.reject("ERR_NO_CORE", "Ядро не скачано: $lib", null)
            return@thread
          }
          val home = File(context.filesDir, if (lib == "singbox") "singbox" else "mihomo")
          if (!home.exists()) home.mkdirs()
          val version = when (lib) {
            "singbox" -> {
              GcSbCore.load(file.absolutePath)
              val err = GcSbCore.gcInit(home.absolutePath)
              if (err.isNotEmpty()) {
                promise.reject("ERR_INIT", "sing-box: $err", null)
                return@thread
              }
              GcSbCore.gcVersion()
            }
            else -> {
              GcCore.load(file.absolutePath)
              val err = GcCore.gcInit(home.absolutePath)
              if (err.isNotEmpty()) {
                promise.reject("ERR_INIT", "mihomo: $err", null)
                return@thread
              }
              GcCore.gcVersion()
            }
          }
          promise.resolve(version)
        } catch (e: Throwable) {
          promise.reject("ERR_LOAD", e.message ?: "Не удалось загрузить ядро", e)
        }
      }
    }

    AsyncFunction("startLibCoreVpn") { lib: String, config: String, allowedJson: String?, disallowedJson: String?, promise: Promise ->
      if (XrayVpnService.isRunning.get() || CoreVpnService.isRunning.get()) {
        promise.reject("ERR_RUNNING", "Сначала остановите текущий VPN", null)
        return@AsyncFunction
      }
      if (LibCoreVpnService.isRunning.get()) {
        promise.reject("ERR_RUNNING", "VPN уже запущен", null)
        return@AsyncFunction
      }
      val loaded = when (lib) {
        "singbox" -> GcSbCore.loaded
        else -> GcCore.loaded
      }
      if (!loaded) {
        promise.reject("ERR_NO_CORE", "Ядро не загружено: $lib", null)
        return@AsyncFunction
      }
      LibCoreVpnService.pendingPromise = promise
      val intent = Intent(context, LibCoreVpnService::class.java).apply {
        action = LibCoreVpnService.ACTION_START
        putExtra("lib", lib)
        putExtra("config", config)
        if (!allowedJson.isNullOrBlank()) putExtra("allowed", allowedJson)
        if (!disallowedJson.isNullOrBlank()) putExtra("disallowed", disallowedJson)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Throwable) {
        LibCoreVpnService.pendingPromise = null
        promise.reject("ERR_START", e.message ?: "Не удалось запустить VPN-сервис", e)
      }
    }

    Function("stopLibCoreVpn") {
      val intent = Intent(context, LibCoreVpnService::class.java).apply {
        action = LibCoreVpnService.ACTION_STOP
      }
      context.startService(intent)
    }

    Function("isLibCoreRunning") {
      LibCoreVpnService.isRunning.get()
    }

    AsyncFunction("tcpPing") { host: String, port: Int, timeoutMs: Int, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-tcp-ping") {
        val start = android.os.SystemClock.elapsedRealtime()
        try {
          java.net.Socket().use { socket ->
            socket.connect(java.net.InetSocketAddress(host, port), timeoutMs.coerceIn(500, 10000))
          }
          promise.resolve((android.os.SystemClock.elapsedRealtime() - start).toInt())
        } catch (e: Throwable) {
          promise.reject("ERR_TCP_PING", e.message ?: "недоступен", e)
        }
      }
    }

    Function("getTrafficSnapshot") {
      val uid = android.os.Process.myUid()
      mapOf(
        "tx" to android.net.TrafficStats.getUidTxBytes(uid),
        "rx" to android.net.TrafficStats.getUidRxBytes(uid)
      )
    }

    AsyncFunction("isPrepared") { promise: Promise ->
      val activity = appContext.currentActivity ?: context
      promise.resolve(VpnService.prepare(activity) == null)
    }

    Function("xrayVersion") {
      val response = XrayApi.invoke(context, "xrayVersion")
      response.optJSONObject("data")?.optString("version") ?: ""
    }

    AsyncFunction("pingBatch") { configsJson: String, timeoutSeconds: Int, url: String?, promise: Promise ->
      kotlin.concurrent.thread(name = "xray-ping") {
        try {
          val payload = JSONObject(configsJson)
          payload.put("timeout", timeoutSeconds)
          if (!url.isNullOrBlank()) {
            payload.put("url", url)
          }
          promise.resolve(XrayApi.invoke(context, "pingBatch", payload).toString())
        } catch (e: Throwable) {
          promise.reject("ERR_PING", e.message ?: "ping failed", e)
        }
      }
    }
  }
}
