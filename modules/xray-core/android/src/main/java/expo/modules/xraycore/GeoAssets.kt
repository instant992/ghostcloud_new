package expo.modules.xraycore

import android.content.Context
import java.io.File

/** Geo-ассеты RoscomVPN (geoip.dat/geosite.dat для Xray и rule-set .srs
 *  для sing-box) вшиты в APK (assets/geo) и распаковываются в песочницу
 *  приложения при первом запуске VPN. Распаковка идемпотентна: если файл уже
 *  на месте и размер совпадает — повторно не копируем. */
object GeoAssets {
  private const val TAG = "GeoAssets"

  /** Каталог geo-данных Xray (geoip.dat + geosite.dat) — путь для xray.location.asset */
  fun xrayAssetDir(context: Context): File {
    val dir = File(context.filesDir, "xray-geo")
    for (name in listOf("geoip.dat", "geosite.dat")) {
      copyAsset(context, "geo/$name", File(dir, name))
    }
    return dir
  }

  /** Распаковка rule-set'ов sing-box в домашний каталог ядра (rule-set, файлы .srs) */
  fun singboxRuleSets(context: Context, home: File) {
    copyAssetDir(context, "geo/singbox-geosite", File(home, "rule-set"))
    copyAssetDir(context, "geo/singbox-geoip", File(home, "rule-set"))
  }

  /** Распаковка rule-set'ов sing-box в домашний каталог ядра */
  private fun copyAssetDir(context: Context, assetDir: String, target: File) {
    val names = try {
      context.assets.list(assetDir)?.toList() ?: emptyList()
    } catch (e: Throwable) {
      android.util.Log.e(TAG, "list $assetDir failed", e)
      emptyList()
    }
    for (name in names) {
      copyAsset(context, "$assetDir/$name", File(target, name))
    }
  }

  private fun copyAsset(context: Context, assetPath: String, out: File) {
    try {
      if (!out.parentFile!!.exists()) out.parentFile!!.mkdirs()
      val size = try {
        context.assets.openFd(assetPath).use { it.length }
      } catch (e: Throwable) {
        -1L // сжатый asset
      }
      if (out.exists() && size > 0 && out.length() == size) return
      context.assets.open(assetPath).use { input ->
        out.outputStream().use { input.copyTo(it) }
      }
    } catch (e: Throwable) {
      android.util.Log.e(TAG, "copy $assetPath failed", e)
    }
  }
}
