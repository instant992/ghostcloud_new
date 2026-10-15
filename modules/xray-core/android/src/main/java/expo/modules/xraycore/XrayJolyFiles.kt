package expo.modules.xraycore

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Staged, verified Android JNI library for the Jolymmiles Xray fork. */
object XrayJolyFiles {
  const val NAME = "libxrayjoly.so"
  private val lock = Any()

  fun activate(context: Context) = activatePath(File(context.filesDir, "cores/$NAME").absolutePath)

  fun activatePath(path: String) = synchronized(CoreRuntime) {
    if (CoreRuntime.isLoadedFile(NAME)) return@synchronized
    val dir = File(path).parentFile ?: return@synchronized
    val pending = File(dir, "$NAME.pending")
    val pendingMeta = File(dir, "$NAME.pending.json")
    if (!pending.exists() || !pendingMeta.exists()) return@synchronized
    val meta = runCatching { JSONObject(pendingMeta.readText()) }.getOrNull() ?: run {
      pending.delete(); pendingMeta.delete(); return@synchronized
    }
    if (pending.length() != meta.optLong("size") || sha256(pending) != meta.optString("sha256")) {
      pending.delete(); pendingMeta.delete(); return@synchronized
    }
    check(pending.renameTo(File(dir, NAME))) { "Не удалось установить Xray Joly" }
    check(pendingMeta.renameTo(File(dir, "$NAME.json"))) { "Не удалось сохранить метаданные Xray Joly" }
    File(dir, "$NAME.verified").writeText(meta.getString("sha256"))
  }

  fun status(context: Context): Map<String, Any> = synchronized(CoreRuntime) {
    activate(context)
    val dir = File(context.filesDir, "cores")
    val file = File(dir, NAME)
    val meta = runCatching { JSONObject(File(dir, "$NAME.json").readText()).takeIf {
      it.optLong("size") == file.length() && File(dir, "$NAME.verified").readText() == it.optString("sha256")
    } }.getOrNull()
    val pending = runCatching { JSONObject(File(dir, "$NAME.pending.json").readText()).takeIf {
      File(dir, "$NAME.pending").length() == it.optLong("size")
    } }.getOrNull()
    mapOf("downloaded" to (meta != null), "size" to file.length(), "path" to file.absolutePath,
      "version" to (meta?.optString("version") ?: ""),
      "pendingVersion" to (pending?.optString("version") ?: ""),
      "loaded" to CoreRuntime.isLoadedFile(NAME))
  }

  fun download(context: Context, url: String, sha256: String, size: Long, version: String,
    progress: (Long, Long) -> Unit): String = synchronized(lock) {
    check(Regex("[0-9a-fA-F]{64}").matches(sha256) && size in 1000000..150000000 && Regex("[0-9]+[.][0-9]+[.][0-9]+(?:-[0-9]+)?").matches(version)) { "Некорректные метаданные Xray Joly" }
    val target = URL(url)
    check(target.protocol == "https" && target.host == "raw.githubusercontent.com" && target.userInfo == null &&
      target.path.startsWith("/instant992/ghostcloudcore_new/main/cores/xray-joly-v") && !target.path.contains("..")) { "Недоверенный адрес ядра" }
    val dir = File(context.filesDir, "cores").also { it.mkdirs() }
    val tmp = File.createTempFile("xray-joly-", ".part", dir)
    val conn = target.openConnection() as HttpURLConnection
    try {
      conn.instanceFollowRedirects = false; conn.connectTimeout = 15000; conn.readTimeout = 15000
      conn.setRequestProperty("User-Agent", "GhostCloud-Android")
      check(conn.responseCode == 200) { "HTTP ${conn.responseCode}" }
      var received = 0L
      conn.inputStream.use { input -> tmp.outputStream().use { output ->
        val buf = ByteArray(256 * 1024)
        while (true) { val n = input.read(buf); if (n < 0) break; received += n; check(received <= size) { "Превышен размер ядра" }; output.write(buf, 0, n); progress(received, size) }
        output.fd.sync()
      } }
      val actual = sha256(tmp)
      check(received == size && actual.equals(sha256, true)) { "Размер или SHA-256 ядра не совпадает" }
      val header = ByteArray(20); tmp.inputStream().use { check(it.read(header) == 20) { "Короткий ELF" } }
      check(header[0] == 0x7f.toByte() && header[1] == 69.toByte() && header[2] == 76.toByte() && header[3] == 70.toByte()) { "Ядро не является ELF" }
      val abi = android.os.Build.SUPPORTED_ABIS.first()
      val expected = when (abi) { "arm64-v8a" -> 2 to 183; "armeabi-v7a" -> 1 to 40; "x86_64" -> 2 to 62; "x86" -> 1 to 3; else -> error("Unsupported ABI: $abi") }
      val machine = (header[18].toInt() and 255) or ((header[19].toInt() and 255) shl 8)
      check(header[4].toInt() == expected.first && header[5].toInt() == 1 && header[16].toInt() == 3 && machine == expected.second) { "ELF ABI mismatch: $abi" }
      val pending = File(dir, "$NAME.pending"); val meta = File(dir, "$NAME.pending.json")
      check(tmp.renameTo(pending)) { "Не удалось сохранить загрузку" }
      meta.writeText(JSONObject().put("version", version).put("sha256", actual).put("size", size).toString())
      activate(context)
      File(dir, NAME).absolutePath
    } finally { conn.disconnect(); tmp.delete() }
  }

  private fun sha256(file: File): String = file.inputStream().use { input ->
    val digest = MessageDigest.getInstance("SHA-256"); val buf = ByteArray(256 * 1024)
    while (true) { val n = input.read(buf); if (n < 0) break; digest.update(buf, 0, n) }
    digest.digest().joinToString("") { "%02x".format(it) }
  }
}
