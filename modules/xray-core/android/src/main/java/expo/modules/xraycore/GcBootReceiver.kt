package expo.modules.xraycore

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.util.Log

/** Автоподключение VPN после загрузки устройства.
 *
 *  Ограничение Android: приложение не может молча поднять VPN после ребута —
 *  если разрешение не сохранено, система обязана показать диалог. Поэтому:
 *  - разрешение сохранено (VpnService.prepare() == null) → поднимаем сервис
 *    напрямую сохранённым конфигом (ключи tile_vpn_*, пишутся при каждом
 *    успешном подключении) — без диалогов и без запуска приложения;
 *  - разрешение не сохранено / конфига нет → открываем приложение, а его
 *    автоподключение (настройка autoconnect) доделает остальное одним тапом.
 *
 *  Полная автоматика без единого диалога — системная опция «Постоянная VPN»
 *  (Always-on VPN); приложение не может включить её за пользователя, в
 *  настройках есть кнопка-инструкция. */
class GcBootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent?) {
    val act = intent?.action ?: return
    if (act != Intent.ACTION_BOOT_COMPLETED &&
      act != "android.intent.action.QUICKBOOT_POWERON" &&
      act != "android.intent.action.MY_PACKAGE_REPLACED"
    ) return

    val prefs = context.getSharedPreferences("gc_settings", Context.MODE_PRIVATE)
    if (prefs.getString("autoboot", "0") != "1") {
      Log.i(TAG, "boot: autoboot выключен")
      return
    }
    if (isVpnRunning()) {
      Log.i(TAG, "boot: VPN уже работает")
      return
    }
    val config = prefs.getString("tile_vpn_config", null)
    if (config.isNullOrEmpty()) {
      Log.i(TAG, "boot: нет сохранённого конфига — открываем приложение")
      launchApp(context)
      return
    }
    // Разрешение VPN не сохранено — нужен диалог, открываем приложение
    try {
      if (VpnService.prepare(context) != null) {
        Log.i(TAG, "boot: разрешение VPN не сохранено — открываем приложение")
        launchApp(context)
        return
      }
    } catch (e: Throwable) {
      Log.w(TAG, "boot: VpnService.prepare failed", e)
      launchApp(context)
      return
    }

    val core = prefs.getString("tile_vpn_core", "xray") ?: "xray"
    val allowed = prefs.getString("tile_vpn_allowed", "") ?: ""
    val blocked = prefs.getString("tile_vpn_blocked", "") ?: ""
    val host = prefs.getString("tile_vpn_host", "") ?: ""
    val port = prefs.getString("tile_vpn_port", "0")?.toIntOrNull() ?: 0
    val failover = prefs.getString("tile_vpn_failover", "") ?: ""
    val serverName = prefs.getString("tile_vpn_server_name", "") ?: ""

    val svc = if (core == "xray") {
      Intent(context, XrayVpnService::class.java).apply {
        action = XrayVpnService.ACTION_START
        putExtra("config", config)
        if (allowed.isNotEmpty()) putExtra("allowed", allowed)
        if (blocked.isNotEmpty()) putExtra("disallowed", blocked)
        if (host.isNotEmpty()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (failover.isNotEmpty()) putExtra("failover", failover)
        if (serverName.isNotEmpty()) putExtra("serverName", serverName)
      }
    } else {
      Intent(context, LibCoreVpnService::class.java).apply {
        action = LibCoreVpnService.ACTION_START
        putExtra("lib", when (core) {
          "mihomo" -> "mihomo"
          "uwuray" -> "uwuray"
          else -> "singbox"
        })
        putExtra("config", config)
        if (allowed.isNotEmpty()) putExtra("allowed", allowed)
        if (blocked.isNotEmpty()) putExtra("disallowed", blocked)
        if (host.isNotEmpty()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (failover.isNotEmpty()) putExtra("failover", failover)
        if (serverName.isNotEmpty()) putExtra("serverName", serverName)
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(svc)
      } else {
        context.startService(svc)
      }
      Log.i(TAG, "boot: VPN-сервис запущен (core=$core)")
    } catch (e: Throwable) {
      Log.e(TAG, "boot: startForegroundService failed", e)
      launchApp(context)
    }
  }

  private fun isVpnRunning(): Boolean =
    XrayVpnService.isRunning.get() ||
      CoreVpnService.isRunning.get() ||
      LibCoreVpnService.isRunning.get()

  private fun launchApp(context: Context) {
    try {
      val i = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (i != null) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
      }
    } catch (_: Throwable) {
    }
  }

  companion object {
    private const val TAG = "GhostCloudBoot"
  }
}
