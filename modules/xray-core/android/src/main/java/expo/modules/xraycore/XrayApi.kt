package expo.modules.xraycore

import android.content.Context
import libXray.LibXray
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Обёртка над LibXray.invoke с автоопределением версии API.
 * apiVersion берётся из самой библиотеки (LibXray.LibXrayAPIVersion) — свежие
 * сборки libXray (v26.9+) требуют СТРОГОГО совпадения версии (сейчас 3) и
 * отвечают «unsupported apiVersion» на любое другое значение; payload-формы
 * (xrayJson / configs / url) от версии к версии не менялись. Для старых aar без
 * этого поля — дефолт 2, с фолбэком на apiVersion 1 (payload {configPath}).
 */
object XrayApi {

  private var forceV1 = false

  // Версия API, которую ожидает подключённый libXray.aar.
  private val apiVersion: Int by lazy {
    runCatching { LibXray.LibXrayAPIVersion.toInt() }.getOrDefault(2)
  }

  private fun errorResult(message: String): JSONObject = try {
    JSONObject().put("success", false).put("error", message)
  } catch (_: Throwable) {
    JSONObject()
  }

  fun invoke(context: Context?, method: String, payload: JSONObject? = null): JSONObject {
    try { CoreRuntime.claim("xray") } catch (e: Throwable) { return errorResult(e.message ?: "Перезапустите приложение") }
    if (!forceV1) {
      val req = JSONObject().put("apiVersion", apiVersion).put("method", method)
      if (payload != null && payload.length() > 0) {
        req.put("payload", payload)
      }
      val res = rawInvoke(req)
      if (res.optBoolean("success", false)) {
        return res
      }
      val err = res.optString("error", "")
      // Только если сама библиотека просит другую версию — пробуем legacy-путь.
      if (err.contains("apiversion", ignoreCase = true) ||
        err.contains("api version", ignoreCase = true)
      ) {
        forceV1 = true
      } else {
        return res
      }
    }

    val req = JSONObject().put("apiVersion", 1).put("method", method)
    val v1Payload = toV1Payload(context, method, payload)
    if (v1Payload != null && v1Payload.length() > 0) {
      req.put("payload", v1Payload)
    }
    return rawInvoke(req)
  }

  private fun rawInvoke(request: JSONObject): JSONObject {
    val raw = runCatching { LibXray.invoke(request.toString()) }
      .getOrElse { return errorResult(it.message ?: "invoke failed") }
    return runCatching { JSONObject(raw) }.getOrElse { errorResult("invalid response") }
  }

  private fun toV1Payload(context: Context?, method: String, payload: JSONObject?): JSONObject? {
    if (payload == null) return null
    return when (method) {
      "runXray" -> {
        val json = payload.optString("xrayJson", "")
        if (json.isEmpty()) {
          payload
        } else {
          JSONObject().put("configPath", writeFile(context, json))
        }
      }
      "pingBatch" -> {
        // ВАЖНО: в отличие от runXray, pingBatch принимает xrayJson напрямую —
        // у PingBatchItemRequest в libXray (apiVersion 3) есть только поля
        // xrayJson/outboundTag, никакого configPath. Прежняя конвертация в
        // configPath оставляла xrayJson пустым, и каждый узел падал с
        // «ping Xray JSON is empty» — URL-проверка пинга не работала вовсе.
        val configsIn = payload.optJSONArray("configs") ?: JSONArray()
        val configsOut = JSONArray()
        for (i in 0 until configsIn.length()) {
          val item = configsIn.optJSONObject(i) ?: continue
          val out = JSONObject()
          val json = item.optString("xrayJson", "")
          if (json.isNotEmpty()) {
            out.put("xrayJson", json)
          }
          val tag = item.optString("outboundTag", "")
          if (tag.isNotEmpty()) {
            out.put("outboundTag", tag)
          }
          configsOut.put(out)
        }
        JSONObject()
          .put("configs", configsOut)
          .put("timeout", payload.optInt("timeout", 5))
          .put("url", payload.optString("url", "http://connect.rom.miui.com/generate_204"))
      }
      else -> payload
    }
  }

  private fun writeFile(context: Context?, content: String): String {
    val dir = context?.cacheDir ?: File.createTempFile("gc", "").parentFile ?: File(".")
    runCatching { dir.mkdirs() }
    val file = try {
      File.createTempFile("xray-", ".json", dir)
    } catch (_: Throwable) {
      File(dir, "xray-config-${System.nanoTime()}.json")
    }
    file.writeText(content)
    return file.absolutePath
  }
}
