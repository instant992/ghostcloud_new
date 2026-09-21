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

/** Общее построение VPN-уведомления: заголовок «GhostCloud», в тексте
 *  «Подключено · таймер» одной строкой, кнопка «Отключить», обновление раз в секунду. */
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

  /** Формат таймера: до часа «ММ:СС», до суток «ЧЧ:ММ:СС», затем дни и недели
   *  («N д ЧЧ:ММ:СС», «N нед M д ЧЧ:ММ:СС») — тот же формат, что в приложении. */
  fun formatElapsed(elapsedMs: Long): String {
    val total = elapsedMs / 1_000
    val d = total / 86_400
    val h = (total % 86_400) / 3_600
    val m = (total % 3_600) / 60
    val s = total % 60
    return when {
      d >= 7 -> "%d нед %d д %02d:%02d:%02d".format(d / 7, d % 7, h, m, s)
      d >= 1 -> "%d д %02d:%02d:%02d".format(d, h, m, s)
      h >= 1 -> "%02d:%02d:%02d".format(h, m, s)
      else -> "%02d:%02d".format(m, s)
    }
  }

  fun build(
    service: Service,
    channelId: String,
    running: Boolean,
    timer: String,
    stopIntent: PendingIntent,
    serverName: String? = null
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
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setOngoing(true)
      .setShowWhen(false)
      .setOnlyAlertOnce(true)
    if (contentIntent != null) builder.setContentIntent(contentIntent)

    if (running) {
      // Без «GhostCloud» в заголовке: имя приложения система и так показывает
      // над уведомлением, получалось две одинаковые строки.
      // Первая строка — «Подключено · таймер», вторая — имя сервера
      // (без него — запасной текст «Вы под защитой»).
      val title = if (timer.isNotEmpty()) "Подключено · $timer" else "Подключено"
      val body = if (!serverName.isNullOrBlank()) serverName else "Вы под защитой"
      builder.setContentTitle(title)
      builder.setContentText(body)
      builder.setStyle(
        Notification.BigTextStyle()
          .bigText(body)
          .setBigContentTitle(title)
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        builder.addAction(Notification.Action.Builder(null, "Отключить", stopIntent).build())
      } else {
        @Suppress("DEPRECATION")
        builder.addAction(0, "Отключить", stopIntent)
      }
    } else {
      builder.setContentTitle("Подключение…")
    }
    return builder.build()
  }
}

/** Тикер: раз в секунду обновляет уведомление, подставляя прошедшее время в текст. */
class NotificationTicker(
  private val service: Service,
  private val channelId: String,
  private val notificationId: Int,
  private val stopIntent: PendingIntent
) {
  private val handler = Handler(Looper.getMainLooper())
  private var startTimeMs = 0L
  private var active = false
  @Volatile
  var serverName: String? = null

  private val runnable = object : Runnable {
    override fun run() {
      if (!active) return
      val elapsed = SystemClock.elapsedRealtime() - startTimeMs
      val nm = service.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(
        notificationId,
        VpnNotifications.build(service, channelId, true, VpnNotifications.formatElapsed(elapsed), stopIntent, serverName)
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
