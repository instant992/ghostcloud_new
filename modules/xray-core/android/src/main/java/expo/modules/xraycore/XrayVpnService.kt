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

  override fun onCreate() {
    super.onCreate()
    LibXray.registerDialerController(dialerController)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopVpnCore()
        stopForegroundAndSelf()
      }
      else -> {
        val config = intent?.getStringExtra("config")
        if (config != null) {
          startForegroundSilently()
          startVpnCore(
            config,
            intent.getStringExtra("allowed")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList(),
            intent.getStringExtra("disallowed")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
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

  private fun startVpnCore(configJson: String, allowedPkgs: List<String>, disallowedPkgs: List<String>) {
    try {
      val builder = Builder()
        .setSession("GhostCloud")
        .setMtu(1500)
        .addAddress("26.26.26.1", 32)
        .addAddress("fdfe:dcba:9876::1", 128)
        .addDnsServer("10.111.222.3")
        .addRoute("0.0.0.0", 0)
        .addRoute("::", 0)
        .addDisallowedApplication(packageName)

      // Android поддерживает либо белый список (allowed), либо чёрный (disallowed).
      // Если заполнен список «через VPN» — работаем в режиме белого списка.
      if (allowedPkgs.isNotEmpty()) {
        for (pkg in allowedPkgs) {
          try {
            builder.addAllowedApplication(pkg)
          } catch (_: Throwable) {
          }
        }
      } else {
        for (pkg in disallowedPkgs) {
          if (pkg == packageName) continue
          try {
            builder.addDisallowedApplication(pkg)
          } catch (_: Throwable) {
          }
        }
      }

      val pfd = builder
        .setBlocking(false)
        .establish()

      if (pfd == null) {
        throw IllegalStateException("Не удалось создать TUN-интерфейс. Проверьте разрешение VPN в настройках.")
      }
      tunInterface = pfd

      val json = JSONObject(configJson)
      val env = json.optJSONObject("env") ?: JSONObject().also { json.put("env", it) }
      env.put("xray.tun.fd", pfd.fd.toLong().toString())

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
    val notification = buildNotification(isRunning.get())
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
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, buildNotification(running))
  }

  private fun buildNotification(running: Boolean): Notification {
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "GhostCloud VPN", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    // Действие "Отключить" — сервис сам обработает ACTION_STOP
    val stopIntent = PendingIntent.getService(
      this,
      1,
      Intent(this, XrayVpnService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    builder
      .setContentTitle("GhostCloud")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setContentIntent(contentIntent)
      .setOngoing(true)

    if (running) {
      builder
        .setContentText("Подключено · тапните для открытия")
        .setUsesChronometer(true)
        .setWhen(System.currentTimeMillis())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        builder.addAction(
          Notification.Action.Builder(null, "Отключить", stopIntent).build()
        )
      } else {
        @Suppress("DEPRECATION")
        builder.addAction(0, "Отключить", stopIntent)
      }
    } else {
      builder.setContentText("Подключение…")
    }
    return builder.build()
  }

  private fun stopForegroundAndSelf() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  override fun onRevoke() {
    stopVpnCore()
    stopForegroundAndSelf()
    super.onRevoke()
  }

  override fun onDestroy() {
    if (isRunning.get()) {
      stopVpnCore()
    }
    super.onDestroy()
  }
}
