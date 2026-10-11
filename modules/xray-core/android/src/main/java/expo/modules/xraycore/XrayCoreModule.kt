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

  private var networkCallback: android.net.ConnectivityManager.NetworkCallback? = null
  @Volatile
  private var lastNetType: String = ""

  /** Текущий тип сети: wifi / mobile / ethernet / other / none.
   *  VPN-туннели пропускаем — нужен тип реальной сети под ними. */
  private fun netTypeNow(): String {
    return try {
      val cm = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
        ?: return "none"
      val nets = cm.allNetworks
      for (net in nets) {
        val caps = cm.getNetworkCapabilities(net) ?: continue
        // VPN-сеть не отражает реальное подключение (Wi-Fi/LTE)
        if (caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)) continue
        if (!caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
        return when {
          caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
          caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "other"
        }
      }
      "none"
    } catch (e: Throwable) {
      "none"
    }
  }

  /** Все установленные пакеты через запятую (для проверки профилей фильтра соединения) */
  private fun installedPackageNames(): String {
    return try {
      val pm = context.packageManager
      pm.getInstalledPackages(0).joinToString(",") { it.packageName }
    } catch (e: Throwable) {
      ""
    }
  }

  /** Выдан ли appop GET_USAGE_STATS («Доступ к данным об использовании»).
   *  Без него на Android 10+ нельзя читать сетевые счётчики других приложений. */
  private fun usageStatsGranted(): Boolean {
    return try {
      val appOps = context.getSystemService(android.content.Context.APP_OPS_SERVICE)
        as? android.app.AppOpsManager ?: return false
      // OPSTR_GET_USAGE_STATS — константа системного класса; читаем рефлексионно
      val opStr = try {
        Class.forName("android.app.AppOpsManager").getField("OPSTR_GET_USAGE_STATS").get(null) as String
      } catch (_: Throwable) {
        "android:get_usage_stats"
      }
      val mode = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(opStr, android.os.Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(opStr, android.os.Process.myUid(), context.packageName)
      }
      mode == android.app.AppOpsManager.MODE_ALLOWED
    } catch (e: Throwable) {
      false
    }
  }

  /** Трафик по UID через NetworkStatsManager (суммарно с загрузки).
   *  Классы в разных версиях SDK лежат в разных пакетах
   *  (старые — в android.net, SDK 36+ — в android.app.usage),
   *  поэтому всё делается рефлексионно. */
  private fun uidTrafficViaStatsManager(): List<Map<String, Any>>? {
    return try {
      if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return null
      val modern = try { Class.forName("android.app.usage.NetworkStatsManager") } catch (_: Throwable) { null }
      val legacy = try { Class.forName("android.net.NetworkStatsManager") } catch (_: Throwable) { null }
      val nsmClass = modern ?: legacy ?: return null
      // Имя системного сервиса «netstats» стабильно во всех версиях Android
      val nsm = context.getSystemService("netstats") ?: return null
      val querySummary = nsmClass.getMethod("querySummary", Int::class.java, String::class.java, Long::class.java, Long::class.java)
      val pm = context.packageManager
      val self = context.packageName
      val rxByUid = mutableMapOf<Int, Long>()
      val txByUid = mutableMapOf<Int, Long>()
      val endMs = System.currentTimeMillis()
      // Типы сетей: TYPE_WIFI = 1, TYPE_MOBILE = 0 (константы стабильны)
      for (type in intArrayOf(1, 0)) {
        val source: Any = try {
          querySummary.invoke(nsm, type, null, 0L, endMs) ?: continue
        } catch (_: Throwable) {
          continue
        }
        val hasNext = source.javaClass.getMethod("hasNextBucket")
        // API различается: старые SDK — nextBucket(); android.net — nextBucket(Bucket);
        // android.app.usage (SDK 36+) — getNextBucket(Bucket). Ищем по порядку.
        var nextNoArg: java.lang.reflect.Method? = null
        var nextFill: java.lang.reflect.Method? = null
        var bucketProto: Any? = null
        try {
          nextNoArg = source.javaClass.getMethod("nextBucket")
        } catch (_: Throwable) {
        }
        if (nextNoArg == null) {
          val bucketClass = try { Class.forName("android.app.usage.NetworkStats\$Bucket") } catch (_: Throwable) { null }
            ?: try { Class.forName("android.net.NetworkStats\$Bucket") } catch (_: Throwable) { null }
          if (bucketClass == null) continue
          bucketProto = bucketClass.getDeclaredConstructor().newInstance()
          nextFill = try {
            source.javaClass.getMethod("getNextBucket", bucketClass)
          } catch (_: Throwable) {
            try {
              source.javaClass.getMethod("nextBucket", bucketClass)
            } catch (_: Throwable) {
              null
            }
          }
          if (nextFill == null) continue
        }
        while (hasNext.invoke(source) == true) {
          val b: Any
          if (nextNoArg != null) {
            b = nextNoArg.invoke(source) ?: continue
          } else {
            // метод возвращает boolean и заполняет переданный Bucket
            if (nextFill?.invoke(source, bucketProto) != true) continue
            b = bucketProto ?: continue
          }
          val uid = b.javaClass.getMethod("getUid").invoke(b) as Int
          if (uid >= android.os.Process.FIRST_APPLICATION_UID) {
            val rx = b.javaClass.getMethod("getRxBytes").invoke(b) as Long
            val tx = b.javaClass.getMethod("getTxBytes").invoke(b) as Long
            if (rx > 0) rxByUid[uid] = (rxByUid[uid] ?: 0L) + rx
            if (tx > 0) txByUid[uid] = (txByUid[uid] ?: 0L) + tx
          }
        }
      }
      val result = mutableListOf<Map<String, Any>>()
      val seen = mutableSetOf<Int>()
      for (info in pm.getInstalledPackages(0)) {
        val ai = info.applicationInfo ?: continue
        val uid = ai.uid
        if (uid < android.os.Process.FIRST_APPLICATION_UID) continue
        if (!seen.add(uid)) continue
        if (info.packageName == self) continue
        val rx = rxByUid[uid] ?: 0L
        val tx = txByUid[uid] ?: 0L
        if (rx <= 0 && tx <= 0) continue
        result.add(
          mapOf(
            "uid" to uid,
            "packageName" to info.packageName,
            "appName" to (ai.loadLabel(pm)?.toString() ?: info.packageName),
            "rx" to rx,
            "tx" to tx
          )
        )
      }
      result
    } catch (e: Throwable) {
      android.util.Log.w("GhostCloud", "uidTrafficViaStatsManager failed: ${e.message}")
      null
    }
  }

  /** Слушаем смены сети (Wi-Fi ↔ LTE) — события для авто-переподключения фильтра соединения */
  private fun startNetworkWatcher() {
    try {
      val cm = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
        ?: return
      val cb = object : android.net.ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: android.net.Network) {
          emit()
        }

        override fun onLost(network: android.net.Network) {
          emit()
        }

        override fun onCapabilitiesChanged(network: android.net.Network, networkCapabilities: android.net.NetworkCapabilities) {
          emit()
        }

        private fun emit() {
          val t = netTypeNow()
          if (t != lastNetType) {
            lastNetType = t
            sendEvent("onNetworkTypeChanged", mapOf("type" to t))
          }
        }
      }
      val req = android.net.NetworkRequest.Builder()
        .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()
      cm.registerNetworkCallback(req, cb)
      networkCallback = cb
      lastNetType = netTypeNow()
    } catch (e: Throwable) {
      android.util.Log.e("GhostCloud", "network watcher failed", e)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("XrayCore")

    // Android 12+ Monet colors are system resources, not a wallpaper seed approximation.
    Function("getSystemMaterialPalette") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        null
      } else {
        try {
          val resources = context.resources
          val shades = intArrayOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)
          val palette = mutableMapOf<String, String>()
          for (family in listOf("accent1", "accent2", "accent3", "neutral1", "neutral2")) {
            for (shade in shades) {
              val name = "system_${family}_${shade}"
              val id = resources.getIdentifier(name, "color", "android")
              check(id != 0) { "Missing system palette resource: $name" }
              val color = resources.getColor(id, context.theme)
              palette["${family}_${shade}"] = String.format(java.util.Locale.ROOT, "#%06X", color and 0xFFFFFF)
            }
          }
          palette
        } catch (_: Throwable) {
          null
        }
      }
    }

    Events("onVpnStateChanged", "onCoreDownloadProgress", "onNetworkTypeChanged")

    OnCreate {
      XrayVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
        GhostCloudTileService.notifyStateChange()
      }
      CoreVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
        GhostCloudTileService.notifyStateChange()
      }
      LibCoreVpnService.stateListener = { running ->
        sendEvent("onVpnStateChanged", mapOf("running" to running))
        GhostCloudTileService.notifyStateChange()
      }
      startNetworkWatcher()
    }

    OnDestroy {
      XrayVpnService.stateListener = null
      CoreVpnService.stateListener = null
      LibCoreVpnService.stateListener = null
      try {
        val cm = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
        networkCallback?.let { cm?.unregisterNetworkCallback(it) }
      } catch (e: Throwable) {
        // контекст уже может быть недоступен при выходе
      }
      networkCallback = null
    }

    Function("getNetworkType") {
      netTypeNow()
    }

    Function("getInstalledPackageNames") {
      installedPackageNames()
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

    AsyncFunction("startVpn") { configJson: String, allowedJson: String?, disallowedJson: String?, host: String?, port: Int, failoverJson: String?, serverName: String?, promise: Promise ->
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
        if (!host.isNullOrBlank()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (!failoverJson.isNullOrBlank()) putExtra("failover", failoverJson)
        if (!serverName.isNullOrBlank()) putExtra("serverName", serverName)
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

    Function("selectCore") { core: String ->
      val runtime = when (core) {
        "xray", "uwuray", "xray-last", "mihomo" -> core
        "sing-box" -> "singbox"
        else -> throw IllegalArgumentException("Неизвестное ядро")
      }
      val prefs = context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE)
      check(prefs.edit().putString("core", core).commit()) { "Не удалось сохранить ядро" }
      val restart = CoreRuntime.requiresRestart(runtime)
      if (restart) {
        val activity = appContext.currentActivity ?: throw IllegalStateException("Нет активного экрана для перезапуска")
        activity.startActivity(Intent(activity, CoreRestartActivity::class.java).putExtra("oldPid", android.os.Process.myPid()))
      }
      restart
    }

    Function("getXrayLastStatus") { XrayLastFiles.status(context) }

    AsyncFunction("downloadXrayLast") { url: String, sha256: String, size: Double, version: String, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-xray-last-download") {
        try {
          check(size.isFinite() && size == size.toLong().toDouble()) { "Invalid core size" }
          val path = XrayLastFiles.download(context, url, sha256, size.toLong(), version) { received, total ->
            sendEvent("onCoreDownloadProgress", mapOf("name" to XrayLastFiles.NAME, "received" to received, "total" to total, "progress" to (received * 100 / total).toInt()))
          }
          promise.resolve(path)
        } catch (e: Throwable) { promise.reject("ERR_DOWNLOAD", e.message, e) }
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

    Function("getMihomoStatus") { MihomoFiles.status(context) }
    AsyncFunction("downloadMihomo") { url: String, sha256: String, size: Double, version: String, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-mihomo-download") {
        try {
          check(size.isFinite() && size == size.toLong().toDouble()) { "Invalid core size" }
          val path = MihomoFiles.download(context, url, sha256, size.toLong(), version) { received, total ->
            sendEvent("onCoreDownloadProgress", mapOf("name" to "libclash.so", "received" to received, "total" to total, "progress" to (received * 100 / total)))
          }
          promise.resolve(path)
        } catch (e: Throwable) { promise.reject("ERR_DOWNLOAD", e.message, e) }
      }
    }

    AsyncFunction("downloadCore") { name: String, url: String, expectedSha256: String, expectedSize: Double, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-core-download") {
        try {
          check(name != XrayLastFiles.NAME) { "Use downloadXrayLast for staged installs" }
          if (name == MihomoFiles.NAME) {
            val version = Regex("/mihomo-v([0-9]+[.][0-9]+[.][0-9]+)/").find(url)?.groupValues?.get(1)
              ?: error("Некорректная версия Mihomo")
            check(expectedSize.isFinite() && expectedSize == expectedSize.toLong().toDouble()) { "Invalid core size" }
            val path = MihomoFiles.download(context, url, expectedSha256, expectedSize.toLong(), version) { received, total ->
              sendEvent("onCoreDownloadProgress", mapOf("name" to name, "received" to received, "total" to total, "progress" to (received * 100 / total)))
            }
            promise.resolve(path)
            return@thread
          }
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
      synchronized(CoreRuntime) {
        if (CoreRuntime.isLoadedFile(name)) {
          promise.reject("ERR_CORE_LOADED", "Перезапустите приложение перед удалением ядра", null)
        } else {
          val file = File(context.filesDir, "cores/$name")
          if (name == XrayLastFiles.NAME || name == MihomoFiles.NAME) {
            File(context.filesDir, "cores/$name.pending").delete()
            File(context.filesDir, "cores/$name.pending.json").delete()
            File(context.filesDir, "cores/$name.json").delete()
          }
          promise.resolve(if (file.exists()) file.delete() else false)
        }
      }
    }

    AsyncFunction("loadLibCore") { lib: String, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-libcore-load") {
        try {
          val fileName = when (lib) {
            "singbox" -> "libsingbox.so"
            "uwuray" -> "libuwuray.so"
      "xray-last" -> "libxraylast.so"
            else -> "libclash.so"
          }
          if (lib == "xray-last") XrayLastFiles.activate(context)
          val file = File(context.filesDir, "cores/$fileName")
          if (!file.exists()) {
            promise.reject("ERR_NO_CORE", "Ядро не скачано: $lib", null)
            return@thread
          }
          val home = File(context.filesDir, when (lib) {
            "singbox" -> "singbox"
            "uwuray" -> "uwuray"
      "xray-last" -> "xray-last"
            else -> "mihomo"
          })
          if (!home.exists()) home.mkdirs()
          val version = when (lib) {
            "singbox" -> {
              // Второй Go-рантайм в процессе запрещён: если уже загружено
              // другое скачиваемое ядро — сообщаем явно (нужен перезапуск приложения).
              if (GcUwuCore.loaded || GcCore.loaded) {
                promise.reject("ERR_CORE_CONFLICT", "Другое ядро уже загружено — перезапустите приложение", null)
                return@thread
              }
              GcSbCore.load(file.absolutePath)
              val err = GcSbCore.gcInit(home.absolutePath)
              if (err.isNotEmpty()) {
                promise.reject("ERR_INIT", "sing-box: $err", null)
                return@thread
              }
              GcSbCore.gcVersion()
            }
            "uwuray" -> {
              // Второй Go-рантайм в процессе запрещён: если уже загружено
              // другое скачиваемое ядро — сообщаем явно (нужен перезапуск приложения).
              if (GcSbCore.loaded || GcCore.loaded) {
                promise.reject("ERR_CORE_CONFLICT", "Другое ядро уже загружено — перезапустите приложение", null)
                return@thread
              }
              GcUwuCore.load(file.absolutePath)
              val err = GcUwuCore.gcInit(home.absolutePath)
              if (err.isNotEmpty()) {
                promise.reject("ERR_INIT", "uwuray: $err", null)
                return@thread
              }
              GcUwuCore.gcVersion()
            }
            "xray-last" -> {
              GcXrayLastCore.load(file.absolutePath)
              val err = GcXrayLastCore.gcInit(home.absolutePath)
              check(err.isEmpty()) { err }
              GcXrayLastCore.gcVersion()
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

    AsyncFunction("startLibCoreVpn") { lib: String, config: String, allowedJson: String?, disallowedJson: String?, host: String?, port: Int, failoverJson: String?, promise: Promise ->
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
        "uwuray" -> GcUwuCore.loaded
      "xray-last" -> GcXrayLastCore.loaded
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
        if (!host.isNullOrBlank()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (!failoverJson.isNullOrBlank()) putExtra("failover", failoverJson)
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
          val addr = java.net.InetAddress.getByName(host)
          java.net.Socket().use { socket ->
            socket.connect(java.net.InetSocketAddress(addr, port), timeoutMs.coerceIn(500, 10000))
          }
          promise.resolve((android.os.SystemClock.elapsedRealtime() - start).toInt())
        } catch (e: Throwable) {
          promise.reject("ERR_TCP_PING", e.message ?: "недоступен", e)
        }
      }
    }

    /** QUIC-зонд задержки для hysteria2 (UDP/QUIC — TCP-рукопожатие к нему
     *  неприменимо, сервер его просто не слушает). Шлём QUIC long-header пакет
     *  с заведомо неподдерживаемой версией (0x0a0a0a0a), добитый мусором до
     *  1200 байт. RFC 9000 §6.1: любой QUIC-сервер ОБЯЗАН ответить пакетом
     *  Version Negotiation, при этом никакого TLS/ключа не нужно — это честный
     *  RTT до сервера (включая UDP-путь). Возвращает задержку в мс.
     *  UDP-пакеты регулярно теряются (до ~20% на живых серверах) — поэтому
     *  внутри одного вызова до 3 проб с коротким таймаутом, берём лучшую. */
    AsyncFunction("quicPing") { host: String, port: Int, timeoutMs: Int, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-quic-ping") {
        val total = timeoutMs.coerceIn(900, 10000)
        val perAttempt = (total / 3).coerceAtLeast(700)
        var best = -1L
        var lastErr: Throwable? = null
        try {
          val addr = java.net.InetAddress.getByName(host)
          for (attempt in 0 until 3) {
            var socket: java.net.DatagramSocket? = null
            try {
              val dcid = ByteArray(8).also { java.security.SecureRandom().nextBytes(it) }
              val scid = ByteArray(8).also { java.security.SecureRandom().nextBytes(it) }
              val pkt = java.io.ByteArrayOutputStream(1200)
              pkt.write(0xC0)                                  // long header + fixed bit
              pkt.write(byteArrayOf(0x0a, 0x0a, 0x0a, 0x0a))   // неподдерживаемая версия → Version Negotiation
              pkt.write(dcid.size); pkt.write(dcid)
              pkt.write(scid.size); pkt.write(scid)
              val pad = ByteArray(1200 - pkt.size())
              java.security.SecureRandom().nextBytes(pad)
              pkt.write(pad)
              socket = java.net.DatagramSocket().apply { soTimeout = perAttempt }
              val t0 = android.os.SystemClock.elapsedRealtime()
              socket.send(java.net.DatagramPacket(pkt.toByteArray(), pkt.size(), addr, port))
              val buf = ByteArray(4096)
              socket.receive(java.net.DatagramPacket(buf, buf.size))  // ждём Version Negotiation
              val rtt = android.os.SystemClock.elapsedRealtime() - t0
              if (best < 0 || rtt < best) best = rtt
              break  // получили ответ — достаточно
            } catch (e: java.net.SocketTimeoutException) {
              lastErr = e  // пакет потерялся — пробуем ещё раз
            } catch (e: java.net.PortUnreachableException) {
              lastErr = e  // ICMP port-unreachable — порт точно закрыт, повтор бесполезен
              break
            } finally {
              runCatching { socket?.close() }
            }
          }
          if (best >= 0) promise.resolve(best.toInt())
          else promise.reject("ERR_QUIC_PING", lastErr?.message ?: "недоступен", lastErr)
        } catch (e: Throwable) {
          promise.reject("ERR_QUIC_PING", e.message ?: "недоступен", e)
        }
      }
    }

    /** Каталог filesDir — нативный путь для лог-файлов ядра (access/error). */
    Function("getLogDir") { context.filesDir.absolutePath }

    /** Хвост текстового файла (последние maxBytes) — журнал запросов/лог ядра. */
    AsyncFunction("readTextFileTail") { path: String, maxBytes: Int, promise: Promise ->
      kotlin.concurrent.thread(name = "gc-read-tail") {
        try {
          val f = File(path)
          if (!f.exists() || f.length() == 0L) {
            promise.resolve("")
            return@thread
          }
          val len = f.length()
          val start = maxOf(0L, len - maxBytes.coerceIn(1024, 4 * 1024 * 1024))
          java.io.RandomAccessFile(f, "r").use { raf ->
            raf.seek(start)
            val buf = ByteArray((len - start).toInt())
            raf.readFully(buf)
            promise.resolve(String(buf, Charsets.UTF_8))
          }
        } catch (e: Throwable) {
          promise.reject("ERR_READ_TAIL", e.message ?: "не удалось прочитать", e)
        }
      }
    }

    /** Обнуляет файл (ротация журнала перед новым VPN-подключением). */
    Function("truncateTextFile") { path: String ->
      runCatching {
        val f = File(path)
        if (f.exists()) java.io.FileOutputStream(f).use { it.channel.truncate(0) }
        true
      }.getOrDefault(false)
    }

    Function("getTrafficSnapshot") {
      val uid = android.os.Process.myUid()
      mapOf(
        "tx" to android.net.TrafficStats.getUidTxBytes(uid),
        "rx" to android.net.TrafficStats.getUidRxBytes(uid)
      )
    }

    // Счётчики трафика по UID установленных приложений (для статистики «куда идёт трафик»).
    // Современный путь — NetworkStatsManager (нужен appop GET_USAGE_STATS),
    // запасной — TrafficStats (Android 9 и ниже; на 10+ чужие UID недоступны).
    AsyncFunction("getUidTraffic") { promise: Promise ->
      kotlin.concurrent.thread(name = "gc-uid-traffic") {
        try {
          val viaStats = if (usageStatsGranted()) uidTrafficViaStatsManager() else null
          if (viaStats != null && viaStats.isNotEmpty()) {
            promise.resolve(viaStats)
            return@thread
          }
          // Фолбэк: TrafficStats (работает только для старых Android)
          val pm = context.packageManager
          val self = context.packageName
          val result = mutableListOf<Map<String, Any>>()
          val seen = mutableSetOf<Int>()
          for (info in pm.getInstalledPackages(0)) {
            val ai = info.applicationInfo ?: continue
            val uid = ai.uid
            if (uid < android.os.Process.FIRST_APPLICATION_UID) continue
            if (!seen.add(uid)) continue
            val pkg = info.packageName
            if (pkg == self) continue
            val rx = android.net.TrafficStats.getUidRxBytes(uid)
            val tx = android.net.TrafficStats.getUidTxBytes(uid)
            if (rx <= 0 && tx <= 0) continue
            result.add(
              mapOf(
                "uid" to uid,
                "packageName" to pkg,
                "appName" to (ai.loadLabel(pm)?.toString() ?: pkg),
                "rx" to if (rx > 0) rx else 0L,
                "tx" to if (tx > 0) tx else 0L
              )
            )
          }
          promise.resolve(result)
        } catch (e: Throwable) {
          promise.reject("ERR_UID_TRAFFIC", e.message ?: "Не удалось получить трафик приложений", e)
        }
      }
    }

    /** Выдан ли appop «Доступ к данным об использовании» (PACKAGE_USAGE_STATS) */
    Function("isUsageStatsAvailable") {
      usageStatsGranted()
    }

    /** Открывает системные настройки «Доступ к использованию» для выдачи appop */
    Function("openUsageAccessSettings") {
      try {
        val intent = android.content.Intent(android.provider.Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "openUsageAccessSettings failed", e)
      }
    }

    /** Открывает системные настройки VPN (для включения «Постоянная VPN» /
     *  Always-on — полная автоматика автоподключения при загрузке устройства). */
    Function("openVpnSettings") {
      try {
        val intent = android.content.Intent(android.provider.Settings.ACTION_VPN_SETTINGS)
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "openVpnSettings failed", e)
      }
    }

    /** Исключение из экономии батареи: без него Android может отложить
     *  BOOT_COMPLETED-приёмник, и автоподключение при загрузке не сработает. */
    Function("isIgnoringBatteryOptimizations") {
      try {
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
        pm?.isIgnoringBatteryOptimizations(context.packageName) == true
      } catch (e: Throwable) {
        false
      }
    }

    Function("requestIgnoreBatteryOptimizations") {
      try {
        val intent = android.content.Intent(
          android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          android.net.Uri.parse("package:" + context.packageName)
        ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      } catch (e: Throwable) {
        // Некоторые прошивки не имеют этого экрана — открываем общий список
        try {
          val intent = android.content.Intent(
            android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
          ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        } catch (_: Throwable) {
        }
      }
    }

    AsyncFunction("isPrepared") { promise: Promise ->
      val activity = appContext.currentActivity ?: context
      promise.resolve(VpnService.prepare(activity) == null)
    }

    Function("xrayVersion") {
      // A version label must not load the built-in Go runtime for another core.
      if (context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE).getString("core", "xray") != "xray") return@Function ""
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

    // ── Смена иконки приложения на рабочем столе (как в старом проекте):
    //    переключение activity-alias в манифесте. Типы: "default" (призрак)
    //    и "foxcloud" (лисья). Выбор сохраняется в SharedPreferences. ──
    Function("setLauncherIcon") { type: String ->
      try {
        val pkg = context.packageName
        val pm = context.packageManager
        val defaultAlias = android.content.ComponentName(pkg, "$pkg.DEFAULT")
        val foxAlias = android.content.ComponentName(pkg, "$pkg.icon_foxcloud")
        val enabled = android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        val disabled = android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        if (type == "foxcloud") {
          pm.setComponentEnabledSetting(defaultAlias, disabled, android.content.pm.PackageManager.DONT_KILL_APP)
          pm.setComponentEnabledSetting(foxAlias, enabled, android.content.pm.PackageManager.DONT_KILL_APP)
        } else {
          pm.setComponentEnabledSetting(foxAlias, disabled, android.content.pm.PackageManager.DONT_KILL_APP)
          pm.setComponentEnabledSetting(defaultAlias, enabled, android.content.pm.PackageManager.DONT_KILL_APP)
        }
        context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE)
          .edit().putString("app_icon", if (type == "foxcloud") "foxcloud" else "default").apply()
        true
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "setLauncherIcon failed", e)
        false
      }
    }

    Function("getLauncherIcon") {
      try {
        context.getSharedPreferences("gc_settings", android.content.Context.MODE_PRIVATE)
          .getString("app_icon", "default") ?: "default"
      } catch (e: Throwable) {
        "default"
      }
    }

    // ── Установка APK-обновления (перенесено из старого приложения):
    //    скачанный файл отдаётся системному установщику через FileProvider. ──

    /** Разрешена ли установка из неизвестных источников (Android 8+) */
    Function("canInstallPackages") {
      if (Build.VERSION.SDK_INT >= 26) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    /** Открывает системные настройки разрешения «Установка неизвестных приложений» */
    Function("openInstallPermissionSettings") {
      try {
        if (Build.VERSION.SDK_INT >= 26) {
          val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            .setData(android.net.Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
        }
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "openInstallPermissionSettings failed", e)
      }
    }

    /** Запускает системный установщик APK (путь — обычный файловый путь) */
    AsyncFunction("installApk") { path: String, promise: Promise ->
      try {
        val file = File(path)
        if (!file.exists() || file.length() == 0L) {
          promise.reject("ERR_FILE", "Файл обновления не найден", null)
          return@AsyncFunction
        }
        val uri = androidx.core.content.FileProvider.getUriForFile(
          context,
          "${context.packageName}.xrayFileProvider",
          file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "installApk failed", e)
        promise.reject("ERR_INSTALL", e.message ?: "Не удалось запустить установку", e)
      }
    }
  }
}
