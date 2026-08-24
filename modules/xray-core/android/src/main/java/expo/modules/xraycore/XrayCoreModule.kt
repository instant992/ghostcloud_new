package expo.modules.xraycore

import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class XrayCoreModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("XrayCore")

    Events("onVpnStateChanged")

    OnCreate {
      XrayVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
      }
      CoreVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
      }
    }

    OnDestroy {
      XrayVpnService.stateListener = null
      CoreVpnService.stateListener = null
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
            if (pm.getLaunchIntentForPackage(pkg) == null) continue
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
