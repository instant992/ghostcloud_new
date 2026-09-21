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
import libXray.DialerController
import libXray.LibXray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class XrayVpnService : VpnService() {

  companion object {
    const val ACTION_START = "expo.modules.xraycore.START"
    const val ACTION_STOP = "expo.modules.xraycore.STOP"

    private const val CHANNEL_ID = "ghostcloud_vpn"
    private const val NOTIFICATION_ID = 1

    val isRunning = AtomicBoolean(false)

    var stateListener: ((Boolean) -> Unit)? = null
    var pendingPromise: Promise? = null

    private var tunInterface: ParcelFileDescriptor? = null
  }

  private val dialerController = object : DialerController {
    override fun protectFd(fd: Long): Boolean {
      return try {
        protect(fd.toInt())
      } catch (e: Throwable) {
        false
      }
    }
  }

  private val stopPendingIntent: PendingIntent by lazy {
    PendingIntent.getService(
      this,
      1,
      Intent(this, XrayVpnService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private val ticker: NotificationTicker by lazy {
    NotificationTicker(this, CHANNEL_ID, NOTIFICATION_ID, stopPendingIntent)
  }

  private var monitor: FailoverMonitor? = null

  override fun onCreate() {
    super.onCreate()
    LibXray.registerDialerController(dialerController)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopVpnCore()
        // stopSelf(startId): если следом уже доставлен ACTION_START с новым
        // startId, система НЕ станет уничтожать сервис — иначе отложенный
        // onDestroy убивал только что поднятый туннель (краш при быстрой
        // смене сервера: stop → start → отложенный destroy).
        stopForegroundCompat()
        stopSelf(startId)
      }
      else -> {
        val config = intent?.getStringExtra("config")
        // Имя сервера для уведомления — пишем ДО тикера, чтобы первая же
        // отрисовка «Подключено · ММ:СС» шла с названием сервера.
        // Фолбэк на prefs (tile_vpn_server_name) — для tile/boot-старта.
        ticker.serverName = intent?.getStringExtra("serverName")
          ?: getSharedPreferences("gc_settings", Context.MODE_PRIVATE)
            .getString("tile_vpn_server_name", null)
        if (config != null) {
          startForegroundSilently()
          startVpnCore(
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

  private fun startVpnCore(
    configJson: String,
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

      // Android поддерживает либо белый список (allowed), либо чёрный (disallowed),
      // смешивать их нельзя — иначе establish упадёт или списки игнорируются.
      // В белом списке само приложение не участвует и отдельное исключение не нужно.
      if (allowedPkgs.isNotEmpty()) {
        android.util.Log.i("GhostCloud", "VPN whitelist: $allowedPkgs")
        for (pkg in allowedPkgs) {
          try {
            builder.addAllowedApplication(pkg)
          } catch (e: Throwable) {
            android.util.Log.e("GhostCloud", "addAllowed failed: $pkg", e)
          }
        }
      } else {
        builder.addDisallowedApplication(packageName)
        android.util.Log.i("GhostCloud", "VPN blacklist: $disallowedPkgs")
        for (pkg in disallowedPkgs) {
          if (pkg == packageName) continue
          try {
            builder.addDisallowedApplication(pkg)
          } catch (e: Throwable) {
            android.util.Log.e("GhostCloud", "addDisallowed failed: $pkg", e)
          }
        }
      }

      val pfd = builder
        .setBlocking(GcNativeSettings.killSwitch(this))
        .establish()

      if (pfd == null) {
        throw IllegalStateException("Не удалось создать TUN-интерфейс. Проверьте разрешение VPN в настройках.")
      }
      tunInterface = pfd

      val json = JSONObject(configJson)
      val env = json.optJSONObject("env") ?: JSONObject().also { json.put("env", it) }
      env.put("xray.tun.fd", pfd.fd.toLong().toString())
      // Geo-данные RoscomVPN: распаковываем geoip.dat/geosite.dat и указываем
      // Xray, откуда их читать (env применяется через os.Setenv до сборки роутера)
      try {
        val geoDir = GeoAssets.xrayAssetDir(applicationContext)
        env.put("xray.location.asset", geoDir.absolutePath)
      } catch (e: Throwable) {
        android.util.Log.e("GhostCloud", "geo assets failed", e)
      }

      try {
        LibXray.setDNS(dialerController, "8.8.8.8:53")
      } catch (_: Throwable) {
      }

      val request = JSONObject()
        .put("xrayJson", json.toString())
      val response = XrayApi.invoke(this, "runXray", request)
      if (!response.optBoolean("success", false)) {
        throw IllegalStateException(response.optString("error", "runXray вернул ошибку"))
      }

      isRunning.set(true)
      startFailoverMonitor(host, port, failoverJson)
      updateNotification(true)
      notifyState(true)
      pendingPromise?.resolve(true)
      pendingPromise = null
    } catch (e: Throwable) {
      runCatching { XrayApi.invoke(applicationContext, "stopXray") }
      closeTun()
      notifyState(false)
      pendingPromise?.reject("ERR_START", e.message ?: "Ошибка запуска VPN", e)
      pendingPromise = null
      stopForegroundAndSelf()
    }
  }

  private fun stopVpnCore() {
    // Сначала гасим failover-монитор и ЖДЁМ (ограниченно) его in-flight
    // restart: quitSafely() не ждёт выполняющийся restartXray, а тот держит
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
      XrayApi.invoke(applicationContext, "stopXray")
    } catch (_: Throwable) {
    }
    closeTun()
    runCatching { LibXray.resetDNS() }
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
      restartXray(candidate.config)
    }
    monitor = mon
    mon.start(host, port)
  }

  /** Перезапуск xray с новым конфигом на существующем TUN (для авто-файловера). */
  private fun restartXray(configJson: String): Boolean {
    val pfd = tunInterface ?: return false
    return try {
      XrayApi.invoke(applicationContext, "stopXray")
      val json = JSONObject(configJson)
      val env = json.optJSONObject("env") ?: JSONObject().also { json.put("env", it) }
      env.put("xray.tun.fd", pfd.fd.toLong().toString())
      // geo-данные RoscomVPN — как при первом старте
      try {
        env.put("xray.location.asset", GeoAssets.xrayAssetDir(applicationContext).absolutePath)
      } catch (_: Throwable) {
      }
      val request = JSONObject().put("xrayJson", json.toString())
      val response = XrayApi.invoke(applicationContext, "runXray", request)
      val ok = response.optBoolean("success", false)
      if (!ok) {
        android.util.Log.e("GhostCloud", "failover restart: ${response.optString("error", "")}")
      }
      ok
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
    stopVpnCore()
    stopForegroundAndSelf()
    super.onRevoke()
  }

  override fun onDestroy() {
    ticker.stop()
    if (isRunning.get()) {
      stopVpnCore()
    }
    super.onDestroy()
  }
}
