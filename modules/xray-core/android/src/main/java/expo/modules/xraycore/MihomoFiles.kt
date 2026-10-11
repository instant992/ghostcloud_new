package expo.modules.xraycore

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Downloads never mutate a mapped library. Pending bytes activate after process restart. */
object MihomoFiles {
  const val NAME = "libclash.so"
  private val downloadLock = Any()
  fun activate(context: Context) = activatePath(File(context.filesDir, "cores/$NAME").absolutePath)
  fun activatePath(path: String) = synchronized(CoreRuntime) {
    if (CoreRuntime.isLoadedFile(NAME)) return@synchronized
    val dir = File(path).parentFile!!
    val pending = File(dir, "$NAME.pending")
    val meta = File(dir, "$NAME.pending.json")
    if (!pending.exists() || !meta.exists()) return@synchronized
    val json = runCatching { JSONObject(meta.readText()) }.getOrNull()
    if (json == null) { pending.delete(); meta.delete(); return@synchronized }
    val hash = pending.inputStream().use { input ->
      val digest = MessageDigest.getInstance("SHA-256")
      val buf = ByteArray(256 * 1024)
      while (true) { val n = input.read(buf); if (n < 0) break; digest.update(buf, 0, n) }
      digest.digest().joinToString("") { "%02x".format(it) }
    }
    if (pending.length() != json.optLong("size") || hash != json.optString("sha256")) {
      pending.delete(); meta.delete(); return@synchronized
    }
    File(dir, "$NAME.verified").delete()
    check(pending.renameTo(File(dir, NAME))) { "Не удалось установить Mihomo" }
    check(meta.renameTo(File(dir, "$NAME.json"))) { "Не удалось сохранить версию Mihomo" }
    File(dir, "$NAME.verified").writeText(json.getString("sha256"))
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
    mapOf("downloaded" to file.exists(), "size" to file.length(), "path" to file.absolutePath,
      "version" to (meta?.optString("version") ?: ""), "pendingVersion" to (pending?.optString("version") ?: ""),
      "loaded" to CoreRuntime.isLoadedFile(NAME))
  }
  fun download(context: Context, url: String, sha256: String, size: Long, version: String,
    progress: (Long, Long) -> Unit): String = synchronized(downloadLock) {
    check(Regex("[0-9a-fA-F]{64}").matches(sha256) && size in 1000000..150000000 && Regex("[0-9]+[.][0-9]+[.][0-9]+").matches(version)) { "Некорректные метаданные Mihomo" }
    val target = URL(url)
    check(target.protocol == "https" && target.host == "raw.githubusercontent.com" && target.userInfo == null && (target.port == -1 || target.port == 443) && target.path.startsWith("/instant992/ghostcloudcore_new/main/cores/mihomo-v") && !target.path.contains("..")) { "Недоверенный адрес ядра" }
    val dir = File(context.filesDir, "cores").also { it.mkdirs() }
    val tmp = File.createTempFile("mihomo-", ".part", dir)
    val conn = target.openConnection() as HttpURLConnection
    try {
      conn.instanceFollowRedirects = false
      conn.connectTimeout = 15000; conn.readTimeout = 15000
      val deadline = System.nanoTime() + 90000000000L
      conn.setRequestProperty("User-Agent", "GhostCloud-Android")
      check(conn.responseCode == 200 && conn.url.protocol == "https") { "HTTP ${conn.responseCode}" }
      val digest = MessageDigest.getInstance("SHA-256")
      var received = 0L
      conn.inputStream.use { input -> tmp.outputStream().use { output ->
        val buf = ByteArray(256 * 1024)
        while (true) {
          check(System.nanoTime() < deadline) { "Core download timed out" }
          val n = input.read(buf); if (n < 0) break
          received += n; check(received <= size) { "Превышен размер ядра" }
          output.write(buf, 0, n); digest.update(buf, 0, n); progress(received, size)
        }
        output.fd.sync()
      } }
      val hash = digest.digest().joinToString("") { "%02x".format(it) }
      check(received == size && hash.equals(sha256, true)) { "Размер или SHA-256 ядра не совпадает" }
      val header = ByteArray(20)
      tmp.inputStream().use { check(it.read(header) == header.size) { "Короткий ELF" } }
      check(header.size == 20 && header[0] == 0x7f.toByte() && header[1] == 69.toByte() && header[2] == 76.toByte() && header[3] == 70.toByte()) { "Ядро не является ELF" }
      val abi = android.os.Build.SUPPORTED_ABIS.first()
      val expected = when (abi) { "arm64-v8a" -> 2 to 183; "armeabi-v7a" -> 1 to 40; "x86_64" -> 2 to 62; "x86" -> 1 to 3; else -> error("Unsupported ABI: $abi") }
      val machine = (header[18].toInt() and 255) or ((header[19].toInt() and 255) shl 8)
      check(header[4].toInt() == expected.first && header[5].toInt() == 1 && header[6].toInt() == 1 && header[16].toInt() == 3 && header[17].toInt() == 0 && machine == expected.second) { "ELF ABI mismatch: $abi" }
      synchronized(CoreRuntime) {
      val pending = File(dir, "$NAME.pending")
      val meta = File(dir, "$NAME.pending.json")
      check(tmp.renameTo(pending)) { "Не удалось сохранить загрузку" }
      val metaTmp = File(dir, "$NAME.pending.json.tmp")
      metaTmp.outputStream().use { output ->
        output.write(JSONObject().put("version", version).put("sha256", hash).put("size", size).toString().toByteArray(Charsets.UTF_8))
        output.fd.sync()
      }
      check(metaTmp.renameTo(meta)) { "Не удалось сохранить метаданные ядра" }
      activate(context)
      }
      File(dir, NAME).absolutePath
    } finally { conn.disconnect(); tmp.delete() }
  }
}
