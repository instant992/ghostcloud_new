package expo.modules.xraycore

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.util.Log
import org.json.JSONArray
import java.net.InetSocketAddress
import java.net.Socket

/** Кандидат для автопереключения: готовый конфиг ядра + host:port для проверки. */
data class FailoverCandidate(val config: String, val host: String, val port: Int)

/** Разбор JSON-массива [{config, host, port}] из extra "failover". */
fun parseFailoverJson(json: String?): List<FailoverCandidate> {
  if (json.isNullOrBlank()) return emptyList()
  return try {
    val arr = JSONArray(json)
    val list = mutableListOf<FailoverCandidate>()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val config = o.optString("config", "")
      val host = o.optString("host", "")
      val port = o.optInt("port", 0)
      if (config.isNotBlank() && host.isNotBlank() && port > 0) {
        list.add(FailoverCandidate(config, host, port))
      }
    }
    list
  } catch (e: Throwable) {
    Log.e(TAG, "parse failover json failed", e)
    emptyList()
  }
}

private const val TAG = "GCFailover"

/**
 * Монитор авто-файловера. Работает в foreground VPN-сервисе, поэтому продолжает
 * работать и при выключенном экране: раз в [CHECK_INTERVAL_MS] делает TCP-пинг
 * текущего сервера; после [MAX_FAILURES] подряд неудач перезапускает ядро с
 * конфигом следующего кандидата (передаётся в [restart]).
 *
 * На время работы удерживает частичный WakeLock — иначе при выключенном экране
 * CPU засыпает и проверки не выполняются.
 */
class FailoverMonitor(
  private val context: Context,
  private val candidates: List<FailoverCandidate>,
  private val restart: (FailoverCandidate) -> Boolean,
) {
  companion object {
    private const val CHECK_INTERVAL_MS = 10_000L
    private const val PING_TIMEOUT_MS = 4_000
    private const val MAX_FAILURES = 3
  }

  private var host: String = ""
  private var port: Int = 0
  private var index = -1
  private var failures = 0
  private var running = false

  private var wakeLock: PowerManager.WakeLock? = null
  private val thread = HandlerThread("gc-failover").apply { start() }
  private val handler = Handler(thread.looper)

  private val checkRunnable = object : Runnable {
    override fun run() {
      if (!running) return
      check()
      if (running) handler.postDelayed(this, CHECK_INTERVAL_MS)
    }
  }

  fun start(host: String, port: Int) {
    if (candidates.isEmpty() || host.isBlank() || port <= 0) return
    this.host = host
    this.port = port
    this.index = -1
    this.failures = 0
    this.running = true
    acquireWakeLock()
    handler.removeCallbacks(checkRunnable)
    handler.postDelayed(checkRunnable, CHECK_INTERVAL_MS)
    Log.i(TAG, "started for $host:$port, candidates=${candidates.size}")
  }

  fun stop() {
    running = false
    handler.removeCallbacks(checkRunnable)
    releaseWakeLock()
  }

  fun destroy() {
    stop()
    thread.quitSafely()
  }

  /** Завершается ли сейчас перезапуск ядра на фоновом потоке.
   *  stop-путь проверяет это, чтобы не закрывать TUN под идущим runXray. */
  fun isRestarting(): Boolean = restarting

  @Volatile
  private var restarting = false

  private fun acquireWakeLock() {
    try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GhostCloud:Failover")
      wl.setReferenceCounted(false)
      wl.acquire()
      wakeLock = wl
    } catch (e: Throwable) {
      Log.e(TAG, "acquire wakelock failed", e)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Throwable) {
    }
    wakeLock = null
  }

  private fun check() {
    try {
      val ok = tcpPing(host, port)
      if (ok) {
        if (failures > 0) Log.i(TAG, "$host:$port reachable again")
        failures = 0
        return
      }
      failures++
      Log.w(TAG, "ping failed for $host:$port ($failures/$MAX_FAILURES)")
      if (failures >= MAX_FAILURES) {
        switchToNext()
      }
    } catch (e: Throwable) {
      Log.e(TAG, "check error", e)
    }
  }

  private fun switchToNext() {
    val total = candidates.size
    if (total == 0) return
    for (step in 1..total) {
      val candidateIndex = (((index + step) % total) + total) % total
      val candidate = candidates[candidateIndex]
      // Проверяем доступность кандидата ДО переключения. Если связь пропала
      // целиком (обрыв, переключение Wi-Fi→LTE), ни один сервер не пройдёт
      // проверку — остаёмся на текущем и продолжаем пробовать: когда связь
      // вернётся, «свой» сервер окажется живым и никакого прыжка на «лучший»
      // не произойдёт. Переключаемся только когда текущий действительно
      // недоступен, а кандидат отвечает.
      if (!tcpPing(candidate.host, candidate.port)) {
        Log.w(TAG, "candidate ${candidate.host}:${candidate.port} unreachable — skip")
        continue
      }
      Log.i(TAG, "switching to ${candidate.host}:${candidate.port}")
      val ok = try {
        restarting = true
        restart(candidate)
      } catch (e: Throwable) {
        Log.e(TAG, "restart error", e)
        false
      } finally {
        restarting = false
      }
      if (ok) {
        index = candidateIndex
        host = candidate.host
        port = candidate.port
        failures = 0
        Log.i(TAG, "switched OK to ${candidate.host}:${candidate.port}")
        return
      }
      Log.w(TAG, "candidate ${candidate.host}:${candidate.port} failed to start")
    }
    Log.e(TAG, "no reachable candidate — stay on current server")
    failures = 0
  }

  private fun tcpPing(h: String, p: Int): Boolean {
    return try {
      Socket().use { socket ->
        socket.connect(InetSocketAddress(h, p), PING_TIMEOUT_MS)
      }
      true
    } catch (e: Throwable) {
      false
    }
  }
}
