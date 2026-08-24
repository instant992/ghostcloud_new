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

  private fun startCore(lib: String, config: String, allowedPkgs: List<String>, disallowedPkgs: List<String>) {
    try {
      val builder = Builder()
        .setSession("GhostCloud")
        .setMtu(1500)
        .addAddress("26.26.26.1", 32)
        .addAddress("fdfe:dcba:9876::1", 128)
        .addDnsServer("10.111.222.3")
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

      val pfd = builder.setBlocking(false).establish()
      if (pfd == null) {
        throw IllegalStateException("Не удалось создать TUN-интерфейс")
      }
      tunInterface = pfd

      val err = when (lib) {
        "mihomo" -> GcCore.gcStart(config, pfd.fd)
        "singbox" -> GcSbCore.gcStart(config, pfd.fd)
        else -> "неизвестное ядро: $lib"
      }
      if (err.isNotEmpty()) {
        throw IllegalStateException("$lib: $err")
      }

      isRunning.set(true)
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
    val stopIntent = PendingIntent.getService(
      this,
      3,
      Intent(this, LibCoreVpnService::class.java).setAction(ACTION_STOP),
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
      builder.addAction(
        Notification.Action.Builder(null, "Отключить", stopIntent).build()
      )
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
    stopCore()
    stopForegroundAndSelf()
    super.onRevoke()
  }

  override fun onDestroy() {
    if (isRunning.get()) {
      stopCore()
    }
    super.onDestroy()
  }
}
