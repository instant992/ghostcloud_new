package expo.modules.xraycore

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi

/** Плитка быстрых настроек: включает/выключает VPN последним использованным
 *  сервером. Конфигурация сохраняется приложением (ключи tile_vpn_*). */
@RequiresApi(Build.VERSION_CODES.N)
class GhostCloudTileService : TileService() {

  companion object {
    private var instance: GhostCloudTileService? = null

    /** Вызывается из VPN-сервисов при смене состояния — плитка обновляется сразу */
    fun notifyStateChange() {
      try {
        instance?.updateTileState()
      } catch (_: Throwable) {
      }
    }
  }

  override fun onStartListening() {
    super.onStartListening()
    instance = this
    updateTileState()
  }

  override fun onStopListening() {
    if (instance === this) instance = null
    super.onStopListening()
  }

  private fun prefs() = getSharedPreferences("gc_settings", MODE_PRIVATE)

  private fun isVpnRunning(): Boolean =
    XrayVpnService.isRunning.get() ||
      CoreVpnService.isRunning.get() ||
      LibCoreVpnService.isRunning.get()

  private fun hasSavedConfig(): Boolean =
    !prefs().getString("tile_vpn_config", null).isNullOrEmpty()

  fun updateTileState() {
    val tile = qsTile ?: return
    tile.state = when {
      isVpnRunning() -> Tile.STATE_ACTIVE
      hasSavedConfig() -> Tile.STATE_INACTIVE
      else -> Tile.STATE_UNAVAILABLE
    }
    tile.updateTile()
  }

  override fun onClick() {
    try {
      if (isVpnRunning()) {
        stopAll()
      } else {
        startSaved()
      }
      updateTileState()
    } catch (_: Throwable) {
    }
  }

  private fun stopAll() {
    try {
      startService(
        Intent(this, XrayVpnService::class.java).apply { action = XrayVpnService.ACTION_STOP }
      )
    } catch (_: Throwable) {
    }
    try {
      startService(
        Intent(this, CoreVpnService::class.java).apply { action = CoreVpnService.ACTION_STOP }
      )
    } catch (_: Throwable) {
    }
    try {
      startService(
        Intent(this, LibCoreVpnService::class.java).apply { action = LibCoreVpnService.ACTION_STOP }
      )
    } catch (_: Throwable) {
    }
  }

  private fun startSaved() {
    val p = prefs()
    val config = p.getString("tile_vpn_config", null)
    if (config.isNullOrEmpty()) {
      launchApp()
      return
    }
    // Разрешение VPN ещё не дано — открываем приложение, чтобы пользователь его выдал
    try {
      if (android.net.VpnService.prepare(this) != null) {
        launchApp()
        return
      }
    } catch (_: Throwable) {
      launchApp()
      return
    }
    val core = p.getString("tile_vpn_core", "xray") ?: "xray"
    val allowed = p.getString("tile_vpn_allowed", "") ?: ""
    val blocked = p.getString("tile_vpn_blocked", "") ?: ""
    val host = p.getString("tile_vpn_host", "") ?: ""
    val port = p.getString("tile_vpn_port", "0")?.toIntOrNull() ?: 0
    val failover = p.getString("tile_vpn_failover", "") ?: ""
    val intent = if (core == "xray") {
      Intent(this, XrayVpnService::class.java).apply {
        action = XrayVpnService.ACTION_START
        putExtra("config", config)
        if (allowed.isNotEmpty()) putExtra("allowed", allowed)
        if (blocked.isNotEmpty()) putExtra("disallowed", blocked)
        if (host.isNotEmpty()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (failover.isNotEmpty()) putExtra("failover", failover)
      }
    } else {
      Intent(this, LibCoreVpnService::class.java).apply {
        action = LibCoreVpnService.ACTION_START
        putExtra("lib", if (core == "mihomo") "mihomo" else "singbox")
        putExtra("config", config)
        if (allowed.isNotEmpty()) putExtra("allowed", allowed)
        if (blocked.isNotEmpty()) putExtra("disallowed", blocked)
        if (host.isNotEmpty()) putExtra("host", host)
        if (port > 0) putExtra("port", port)
        if (failover.isNotEmpty()) putExtra("failover", failover)
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(intent)
      } else {
        startService(intent)
      }
    } catch (_: Throwable) {
      launchApp()
    }
  }

  private fun launchApp() {
    try {
      val intent = packageManager.getLaunchIntentForPackage(packageName)
      if (intent != null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
      }
    } catch (_: Throwable) {
    }
  }
}
