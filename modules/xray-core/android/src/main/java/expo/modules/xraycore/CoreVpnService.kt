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
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VPN-сервис для внешних ядер (sing-box), запускаемых как дочерний процесс.
 * Ядро получает TUN-дескриптор через поле tunFd в конфиге.
 */
class CoreVpnService : VpnService() {

  companion object {
    const val ACTION_START = "expo.modules.xraycore.CORE_START"
    const val ACTION_STOP = "expo.modules.xraycore.CORE_STOP"

    private const val CHANNEL_ID = "ghostcloud_vpn_core"
    private const val NOTIFICATION_ID = 2

    val isRunning = AtomicBoolean(false)

    var stateListener: ((Boolean) -> Unit)? = null
    var pendingPromise: Promise? = null

    private var process: Process? = null
    private var tunInterface: ParcelFileDescriptor? = null

    fun coreBinaryPath(context: android.content.Context, name: String): File {
      val dir = context.applicationInfo.nativeLibraryDir
      return File(dir, name)
    }
  }

  private val stopPendingIntent: PendingIntent by lazy {
    PendingIntent.getService(
      this,
      2,
      Intent(this, CoreVpnService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private val ticker: NotificationTicker by lazy {
    NotificationTicker(this, CHANNEL_ID, NOTIFICATION_ID, stopPendingIntent)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCore()
        stopForegroundAndSelf()
      }
      else -> {
        val config = intent?.getStringExtra("config")
        val coreName = intent?.getStringExtra("core") ?: "libsingbox.so"
        if (config != null) {
          startForegroundSilently()
          startCore(
            coreName,
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

  private fun startCore(coreName: String, configJson: String, allowedPkgs: List<String>, disallowedPkgs: List<String>) {
    try {
      val binary = coreBinaryPath(applicationContext, coreName)
      if (!binary.exists()) {
        throw IllegalStateException("Ядро не найдено: ${binary.absolutePath}")
      }

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

      // Передаём дескриптор TUN ядру через конфиг
      val json = JSONObject(configJson)
      val inbounds = json.optJSONArray("inbounds")
      if (inbounds != null && inbounds.length() > 0) {
        val tun = inbounds.optJSONObject(0)
        tun?.put("tunFd", pfd.fd)
      }
      json.put("tunFd", pfd.fd)

      val configFile = File(cacheDir, "core_config.json")
      configFile.writeText(json.toString())

      val pb = ProcessBuilder(binary.absolutePath, "run", "-c", configFile.absolutePath)
      pb.redirectErrorStream(true)
      val proc = pb.start()
      process = proc

      // Читаем вывод ядра, иначе процесс может заблокироваться на переполненном пайпе
      val reader = Thread {
        try {
          proc.inputStream.bufferedReader().use { r ->
            while (true) {
              val line = r.readLine() ?: break
              android.util.Log.i("GhostCore", line)
            }
          }
        } catch (_: Throwable) {
        }
      }
      reader.isDaemon = true
      reader.start()

      // Наблюдаем за процессом: если ядро упало — гасим сервис
      Thread {
        val code = try {
          proc.waitFor()
        } catch (_: Throwable) {
          -1
        }
        android.util.Log.w("GhostCloud", "core exited with code $code")
        if (isRunning.get()) {
          notifyState(false)
          closeTun()
          stopForegroundAndSelf()
        }
      }.start()

      isRunning.set(true)
      updateNotification(true)
      notifyState(true)
      pendingPromise?.resolve(true)
      pendingPromise = null
    } catch (e: Throwable) {
      runCatching { process?.destroy() }
      process = null
      closeTun()
      notifyState(false)
      pendingPromise?.reject("ERR_START", e.message ?: "Ошибка запуска ядра", e)
      pendingPromise = null
      stopForegroundAndSelf()
    }
  }

  private fun stopCore() {
    try {
      process?.destroy()
    } catch (_: Throwable) {
    }
    process = null
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
    val notification = VpnNotifications.build(this, CHANNEL_ID, isRunning.get(), "GhostCloud", stopPendingIntent)
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
      nm.notify(NOTIFICATION_ID, VpnNotifications.build(this, CHANNEL_ID, false, "GhostCloud", stopPendingIntent))
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
