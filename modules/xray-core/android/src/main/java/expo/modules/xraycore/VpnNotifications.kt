package expo.modules.xraycore

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/** Общее построение VPN-уведомления: таймер в заголовке (как в старом приложении),
 *  кнопка «Отключить», обновление раз в секунду. */
object VpnNotifications {

  fun ensureChannel(ctx: Context, channelId: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(channelId) == null) {
        nm.createNotificationChannel(
          NotificationChannel(channelId, "GhostCloud VPN", NotificationManager.IMPORTANCE_LOW)
        )
      }
    }
  }

  /** Формат таймера: до часа «ММ:СС», после часа «ЧЧ:ММ:СС» (как в старом приложении). */
  fun formatElapsed(elapsedMs: Long): String {
    val h = elapsedMs / 3_600_000
    val m = (elapsedMs / 60_000) % 60
    val s = (elapsedMs / 1_000) % 60
    return if (h >= 1) "%02d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
  }

  fun build(
    service: Service,
    channelId: String,
    running: Boolean,
    title: String,
    stopIntent: PendingIntent
  ): Notification {
    ensureChannel(service, channelId)
    val launchIntent = service.packageManager.getLaunchIntentForPackage(service.packageName)
    val contentIntent = if (launchIntent != null) {
      PendingIntent.getActivity(
        service, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    } else null

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(service, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(service)
    }
    builder
      .setContentTitle(title)
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setOngoing(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
    if (contentIntent != null) builder.setContentIntent(contentIntent)

    if (running) {
      builder.setContentText("Подключено")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        builder.addAction(Notification.Action.Builder(null, "Отключить", stopIntent).build())
      } else {
        @Suppress("DEPRECATION")
        builder.addAction(0, "Отключить", stopIntent)
      }
    } else {
      builder.setContentText("Подключение…")
    }
    return builder.build()
  }
}

/** Тикер: раз в секунду обновляет уведомление, подставляя прошедшее время в заголовок. */
class NotificationTicker(
  private val service: Service,
  private val channelId: String,
  private val notificationId: Int,
  private val stopIntent: PendingIntent
) {
  private val handler = Handler(Looper.getMainLooper())
  private var startTimeMs = 0L
  private var active = false

  private val runnable = object : Runnable {
    override fun run() {
      if (!active) return
      val elapsed = SystemClock.elapsedRealtime() - startTimeMs
      val nm = service.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(
        notificationId,
        VpnNotifications.build(service, channelId, true, VpnNotifications.formatElapsed(elapsed), stopIntent)
      )
      handler.postDelayed(this, 1000)
    }
  }

  fun start() {
    startTimeMs = SystemClock.elapsedRealtime()
    active = true
    handler.removeCallbacks(runnable)
    handler.post(runnable)
  }

  fun stop() {
    active = false
    handler.removeCallbacks(runnable)
  }
}
