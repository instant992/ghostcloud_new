package expo.modules.xraycore

import android.content.Context

/** Общие нативные настройки, которые читаются напрямую из SharedPreferences
 *  "gc_settings" (те же ключи, что пишет JS-слой через setSetting). Нужны
 *  сервисам, стартующим без JS: плитка быстрых настроек, бут-ресивер. */
object GcNativeSettings {

  fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences("gc_settings", Context.MODE_PRIVATE)

  /** Kill Switch: блокирующий туннель. При обрыве/смерти ядра Android режет
   *  весь трафик устройства вместо утечки напрямую (VpnService.setBlocking). */
  fun killSwitch(context: Context): Boolean =
    prefs(context).getString("killswitch", "0") == "1"

  /** Автоподключение VPN после загрузки устройства. */
  fun autoBoot(context: Context): Boolean =
    prefs(context).getString("autoboot", "0") == "1"
}
