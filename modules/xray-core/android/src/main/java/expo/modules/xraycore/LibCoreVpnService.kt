package expo.modules.xraycore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VPN-сервис для загружаемых библиотечных ядер (mihomo, sing-box).
 * Ядро работает в процессе приложения, TUN-дескриптор передаётся напрямую.
 * Тип ядра передаётся через extra "lib": "mihomo" | "singbox".
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

  private var currentLib: String = "mihomo"
  private var monitor: FailoverMonitor? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCore()
        stopForegroundAndSelf()
      }
      else -> {
        val config = intent?.getStringExtra("config")
        val lib = intent?.getStringExtra("lib") ?: "mihomo"
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

      // Geo rule-set'ы RoscomVPN: распаковываем в домашний каталог ядра
      // (тот же, что задан в loadLibCore: filesDir/singbox или filesDir/mihomo;
      //  gcInit делает chdir в него, поэтому относительные пути rule-set/... работают)
      try {
        val home = File(filesDir, if (lib == "singbox") "singbox" else "mihomo")
        if (!home.exists()) home.mkdirs()
        if (lib == "singbox") GeoAssets.singboxRuleSets(applicationContext, home)
        else GeoAssets.mihomoRuleSets(applicationContext, home)
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "geo rule-sets failed", e)
      }

      val err = when (lib) {
        "mihomo" -> GcCore.gcStart(config, pfd.fd)
        "singbox" -> GcSbCore.gcStart(config, pfd.fd)
        else -> "неизвестное ядро: $lib"
      }
      if (err.isNotEmpty()) {
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
      runCatching { stopLibCore(lib) }
      closeTun()
      notifyState(false)
      pendingPromise?.reject("ERR_START", e.message ?: "Ошибка запуска ядра", e)
      pendingPromise = null
      stopForegroundAndSelf()
    }
  }

  private fun stopLibCore(lib: String) {
    when (lib) {
      "mihomo" -> if (GcCore.loaded) GcCore.gcStop()
      "singbox" -> if (GcSbCore.loaded) GcSbCore.gcStop()
    }
  }

  private fun stopCore() {
    monitor?.destroy()
    monitor = null
    try {
      if (GcCore.loaded) GcCore.gcStop()
      if (GcSbCore.loaded) GcSbCore.gcStop()
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
      val err = when (currentLib) {
        "mihomo" -> GcCore.gcStart(config, pfd.fd)
        "singbox" -> GcSbCore.gcStart(config, pfd.fd)
        else -> "неизвестное ядро: $currentLib"
      }
      if (err.isNotEmpty()) {
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

  private fun stopForegroundAndSelf() {
    ticker.stop()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
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
