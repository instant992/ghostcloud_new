package expo.modules.xraycore

import android.content.Context
import libXray.LibXray
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Обёртка над LibXray.invoke с автоопределением версии API.
 * Свежие сборки libXray используют apiVersion 2 (payload {xrayJson}),
 * более старые — apiVersion 1 (payload {configPath}).
 */
object XrayApi {

  private var forceV1 = false

  private fun errorResult(message: String): JSONObject = try {
    JSONObject().put("success", false).put("error", message)
  } catch (_: Throwable) {
    JSONObject()
  }

  fun invoke(context: Context?, method: String, payload: JSONObject? = null): JSONObject {
    if (!forceV1) {
      val req = JSONObject().put("apiVersion", 2).put("method", method)
      if (payload != null && payload.length() > 0) {
        req.put("payload", payload)
      }
      val res = rawInvoke(req)
      if (res.optBoolean("success", false)) {
        return res
      }
      val err = res.optString("error", "")
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
        val configsIn = payload.optJSONArray("configs") ?: JSONArray()
        val configsOut = JSONArray()
        for (i in 0 until configsIn.length()) {
          val item = configsIn.optJSONObject(i) ?: continue
          val json = item.optString("xrayJson", "")
          if (json.isNotEmpty()) {
            configsOut.put(JSONObject().put("configPath", writeFile(context, json)))
          } else {
            val path = item.optString("configPath", "")
            if (path.isNotEmpty()) {
              configsOut.put(JSONObject().put("configPath", path))
            }
          }
        }
        JSONObject()
          .put("configs", configsOut)
          .put("timeout", payload.optInt("timeout", 5))
          .put("url", payload.optString("url", "https://cp.cloudflare.com/"))
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
