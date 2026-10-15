package expo.modules.xraycore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VPN-сервис для загружаемых JNI-ядер (sing-box и Xray-форки).
 * Тип ядра передаётся через extra "lib".
 */
class LibCoreVpnService : VpnService() {

  companion object {
    const val ACTION_START = "expo.modules.xraycore.LIBCORE_START"
    const val ACTION_STOP = "expo.modules.xraycore.LIBCORE_STOP"

    private const val CHANNEL_ID = "ghostcloud_vpn_libcore"
    private const val NOTIFICATION_ID = 3

    val isRunning = AtomicBoolean(false)

    var stateListener: ((Boolean) -> Unit)? = null
    var pendingPromise: Promise? = null

    private var tunInterface: ParcelFileDescriptor? = null
  }

  private val stopPendingIntent: PendingIntent by lazy {
    PendingIntent.getService(
      this,
      3,
      Intent(this, LibCoreVpnService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private val ticker: NotificationTicker by lazy {
    NotificationTicker(this, CHANNEL_ID, NOTIFICATION_ID, stopPendingIntent)
  }

  private var currentLib: String = "xray-joly"
  private var monitor: FailoverMonitor? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCore()
        // stopSelf(startId): не даём отложенному onDestroy убить туннель,
        // если новый ACTION_START уже доставлен (краш при быстрой смене сервера).
        stopForegroundCompat()
        stopSelf(startId)
      }
      else -> {
        val config = intent?.getStringExtra("config")
        val lib = intent?.getStringExtra("lib") ?: "xray-joly"
        // Имя сервера для уведомления: из intent (tile/boot) или из prefs
        // (JS-старт — там extra не проходит из-за лимита параметров AsyncFunction;
        // saveTileConfig пишет tile_vpn_server_name перед каждым стартом).
        ticker.serverName = intent?.getStringExtra("serverName")
          ?: getSharedPreferences("gc_settings", Context.MODE_PRIVATE)
            .getString("tile_vpn_server_name", null)
        if (config != null) {
          startForegroundSilently()
          startCore(
            lib,
            config,
            intent.getStringExtra("allowed")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList(),
            intent.getStringExtra("disallowed")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList(),
            intent.getStringExtra("host"),
            intent.getIntExtra("port", 0),
            intent.getStringExtra("failover")
          )
        } else if (isRunning.get()) {
          startForegroundSilently()
        } else {
          stopSelf()
        }
      }
    }
    return START_STICKY
  }

  private fun startCore(
    lib: String,
    config: String,
    allowedPkgs: List<String>,
    disallowedPkgs: List<String>,
    host: String? = null,
    port: Int = 0,
    failoverJson: String? = null
  ) {
    try {
      // Конфиг может дополняться env-секцией (xray.location.asset) для UwuRay
      val configRef = java.util.concurrent.atomic.AtomicReference(config)
      val builder = Builder()
        .setSession("GhostCloud")
        .setMtu(1500)
        .addAddress("26.26.26.1", 32)
        .addAddress("fdfe:dcba:9876::1", 128)
        // Основной DNS — внутренний адрес туннеля (перехватывается ядром для
        // доменных правил обхода). Резервный — реальный публичный: без него
        // приложения, исключённые из туннеля («мимо VPN»), не могут резолвить
        // имена и остаются без интернета.
        .addDnsServer("10.111.222.3")
        .addDnsServer("8.8.8.8")
        .addRoute("0.0.0.0", 0)
        .addRoute("::", 0)

      if (allowedPkgs.isNotEmpty()) {
        for (pkg in allowedPkgs) {
          try {
            builder.addAllowedApplication(pkg)
          } catch (e: Throwable) {
            android.util.Log.e("GhostCloud", "addAllowed failed: $pkg", e)
          }
        }
      } else {
        builder.addDisallowedApplication(packageName)
        for (pkg in disallowedPkgs) {
          if (pkg == packageName) continue
          try {
            builder.addDisallowedApplication(pkg)
          } catch (e: Throwable) {
            android.util.Log.e("GhostCloud", "addDisallowed failed: $pkg", e)
          }
        }
      }

      val pfd = builder.setBlocking(GcNativeSettings.killSwitch(this)).establish()
      if (pfd == null) {
        throw IllegalStateException("Не удалось создать TUN-интерфейс")
      }
      tunInterface = pfd
      currentLib = lib
      // Ядру передаём ДУБЛИКАТ fd (ParcelFileDescriptor.dup): Go-рантайм при
      // ошибке/остановке закрывает свой fd сам, а Java закрывает оригинал через
      // tunInterface. Без дубля на ошибке старта получался double-close одного fd →
      // fdsan abort (SIGABRT «double-close of file descriptor») — краш процесса,
      // который к тому же терял текст ошибки ядра (pendingPromise.reject не успевал).
      val coreFd = if (currentLib == "xray-last" || currentLib == "xray-joly") pfd.fd else run {
        val dup = pfd.dup()
        dup.detachFd() // снимаем владение: GC-финализатор не закроет fd под Go-ядром
      }

      // Xray JNI cores use the Xray asset directory; sing-box has its own rule sets.
      try {
        val home = File(filesDir, when (lib) {
          "singbox" -> "singbox"
          "uwuray" -> "uwuray"
          "xray-last" -> "xray-last"
          "xray-joly" -> "xray-joly"
          else -> throw IllegalArgumentException("Неизвестное ядро: $lib")
        })
        if (!home.exists()) home.mkdirs()
        when (lib) {
          "singbox" -> GeoAssets.singboxRuleSets(applicationContext, home)
          "uwuray", "xray-last", "xray-joly" -> {
            val geoDir = GeoAssets.xrayAssetDir(applicationContext)
            val json = org.json.JSONObject(config)
            val env = json.optJSONObject("env") ?: org.json.JSONObject().also { json.put("env", it) }
            env.put("xray.location.asset", geoDir.absolutePath)
            configRef.set(json.toString())
          }
        }
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "geo rule-sets failed", e)
      }

      // Библиотека ядра должна быть загружена в этом процессе. Путь через
      // приложение грузит её заранее (loadLibCore), но boot-receiver/плитка
      // стартуют сервис напрямую — подгружаем здесь (идемпотентно).
      ensureLibLoaded(lib)

      val err = when (lib) {
        "singbox" -> GcSbCore.gcStart(configRef.get(), coreFd)
        "uwuray" -> GcUwuCore.gcStart(configRef.get(), coreFd)
        "xray-joly" -> GcXrayJolyCore.gcStart(configRef.get(), coreFd)
        "xray-last" -> GcXrayLastCore.gcStart(configRef.get(), coreFd)
        else -> "неизвестное ядро: $lib"
      }
      if (err.isNotEmpty()) {
        // НЕ закрываем coreFd здесь: Go-обёртка при неудаче старта сама
        // закрывает переданный dup (inst.Close → tunFile.Close). Повторное
        // закрытие из Java = fdsan double-close → SIGABRT всего процесса.
        throw IllegalStateException("$lib: $err")
      }

      isRunning.set(true)
      currentLib = lib
      startFailoverMonitor(host, port, failoverJson)
      updateNotification(true)
      notifyState(true)
      pendingPromise?.resolve(true)
      pendingPromise = null
    } catch (e: Throwable) {
      android.util.Log.e("GhostCloud", "startCore($lib) failed: ${e.message}", e)
      runCatching { stopLibCore(lib) }
      closeTun()
      notifyState(false)
      pendingPromise?.reject("ERR_START", e.message ?: "Ошибка запуска ядра", e)
      pendingPromise = null
      stopForegroundAndSelf()
    }
  }

  /** Ленивая загрузка .so ядра в текущий процесс (для boot/tile-пути без JS). */
  private fun ensureLibLoaded(lib: String) {
    val fileName = when (lib) {
      "singbox" -> "libsingbox.so"
      "uwuray" -> "libuwuray.so"
          "xray-joly" -> "libxrayjoly.so"
          "xray-last" -> "libxraylast.so"
          else -> throw IllegalArgumentException("Неизвестное ядро: $lib")
    }
    if (lib == "xray-last") XrayLastFiles.activate(applicationContext)
    if (lib == "xray-joly") XrayJolyFiles.activate(applicationContext)
    val file = File(filesDir, "cores/$fileName")
    val home = File(filesDir, when (lib) {
      "singbox" -> "singbox"; "uwuray" -> "uwuray"; "xray-last" -> "xray-last"; "xray-joly" -> "xray-joly"
      else -> throw IllegalArgumentException("Неизвестное ядро: $lib")
    })
    if (!home.exists()) home.mkdirs()
    if (!file.exists()) throw IllegalStateException("Ядро не скачано: $lib")
    val already = when (lib) {
      "singbox" -> GcSbCore.loaded
      "uwuray" -> GcUwuCore.loaded
      "xray-joly" -> GcXrayJolyCore.loaded
      "xray-last" -> GcXrayLastCore.loaded
      else -> false
    }
    if (already) return
    when (lib) {
      "singbox" -> { GcSbCore.load(file.absolutePath); GcSbCore.gcInit(home.absolutePath) }
      "uwuray" -> { GcUwuCore.load(file.absolutePath); GcUwuCore.gcInit(home.absolutePath) }
          "xray-joly" -> { GcXrayJolyCore.load(file.absolutePath); GcXrayJolyCore.gcInit(home.absolutePath) }
          "xray-last" -> { GcXrayLastCore.load(file.absolutePath); check(GcXrayLastCore.gcInit(home.absolutePath).isEmpty()) }
    }
  }

  private fun stopLibCore(lib: String) {
    when (lib) {
      "xray-joly" -> if (GcXrayJolyCore.loaded) GcXrayJolyCore.gcStop()
      "xray-last" -> if (GcXrayLastCore.loaded) GcXrayLastCore.gcStop()
    }
  }

  private fun stopCore() {
    // Сначала гасим failover-монитор и ЖДЁМ (ограниченно) его in-flight
    // restart: quitSafely() не ждёт выполняющийся restartLibCore, а тот держит
    // TUN fd — closeTun() под ним = use-after-close → SIGSEGV в Go-рантайме
    // (краш процесса при смене сервера/отключении VPN).
    monitor?.let { m ->
      m.stop()
      val deadline = System.currentTimeMillis() + 3000
      while (m.isRestarting() && System.currentTimeMillis() < deadline) {
        try { Thread.sleep(50) } catch (_: Throwable) { break }
      }
      m.destroy()
    }
    monitor = null
    try {
      if (GcSbCore.loaded) GcSbCore.gcStop()
      if (GcUwuCore.loaded) GcUwuCore.gcStop()
      if (GcXrayJolyCore.loaded) GcXrayJolyCore.gcStop()
      if (GcXrayLastCore.loaded) GcXrayLastCore.gcStop()
    } catch (_: Throwable) {
    }
    closeTun()
    notifyState(false)
    pendingPromise?.let { promise ->
      promise.reject("ERR_STOPPED", "VPN остановлен до завершения запуска", null)
    }
    pendingPromise = null
  }

  private fun startFailoverMonitor(host: String?, port: Int, failoverJson: String?) {
    monitor?.destroy()
    monitor = null
    val candidates = parseFailoverJson(failoverJson)
    if (candidates.isEmpty() || host.isNullOrBlank() || port <= 0) return
    val mon = FailoverMonitor(applicationContext, candidates) { candidate ->
      restartLibCore(candidate.config)
    }
    monitor = mon
    mon.start(host, port)
  }

  /** Перезапуск ядра с новым конфигом на существующем TUN (для авто-файловера). */
  private fun restartLibCore(config: String): Boolean {
    val pfd = tunInterface ?: return false
    return try {
      stopLibCore(currentLib)
      // UwuRay (форк Xray): как и при первом старте, добавляем xray.location.asset
      var cfg = config
      if (currentLib == "uwuray" || currentLib == "xray-last" || currentLib == "xray-joly") {
        try {
          val geoDir = GeoAssets.xrayAssetDir(applicationContext)
          val json = org.json.JSONObject(config)
          val env = json.optJSONObject("env") ?: org.json.JSONObject().also { json.put("env", it) }
          env.put("xray.location.asset", geoDir.absolutePath)
          cfg = json.toString()
        } catch (_: Throwable) {
        }
      }
      // Дубликат fd — как при первом старте: ядро закрывает свой fd само
      // (inst.Close), оригинал остаётся у Java (см. комментарий в startCore).
      val coreFd = if (currentLib == "xray-last" || currentLib == "xray-joly") pfd.fd else run {
        val dup = pfd.dup()
        dup.detachFd() // снимаем владение: GC-финализатор не закроет fd под Go-ядром
      }
      val err = when (currentLib) {
        "singbox" -> GcSbCore.gcStart(cfg, coreFd)
        "uwuray" -> GcUwuCore.gcStart(cfg, coreFd)
        "xray-joly" -> GcXrayJolyCore.gcStart(cfg, coreFd)
        "xray-last" -> GcXrayLastCore.gcStart(cfg, coreFd)
        else -> "неизвестное ядро: $currentLib"
      }
      if (err.isNotEmpty()) {
        // coreFd не закрываем — его закрыла Go-обёртка (см. startCore)
        android.util.Log.e("GhostCloud", "failover restart: $currentLib: $err")
        false
      } else {
        true
      }
    } catch (e: Throwable) {
      android.util.Log.e("GhostCloud", "failover restart error", e)
      false
    }
  }

  private fun closeTun() {
    try {
      tunInterface?.close()
    } catch (_: Throwable) {
    }
    tunInterface = null
  }

  private fun notifyState(running: Boolean) {
    isRunning.set(running)
    stateListener?.invoke(running)
  }

  private fun startForegroundSilently() {
    val notification = VpnNotifications.build(this, CHANNEL_ID, isRunning.get(), "", stopPendingIntent)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun updateNotification(running: Boolean) {
    if (running) {
      ticker.start()
    } else {
      ticker.stop()
      val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIFICATION_ID, VpnNotifications.build(this, CHANNEL_ID, false, "", stopPendingIntent))
    }
  }

  private fun stopForegroundCompat() {
    ticker.stop()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun stopForegroundAndSelf() {
    stopForegroundCompat()
    stopSelf()
  }

  override fun onRevoke() {
    stopCore()
    stopForegroundAndSelf()
    super.onRevoke()
  }

  override fun onDestroy() {
    ticker.stop()
    if (isRunning.get()) {
      stopCore()
    }
    super.onDestroy()
  }
}
