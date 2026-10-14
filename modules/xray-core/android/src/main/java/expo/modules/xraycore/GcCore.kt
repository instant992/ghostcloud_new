package expo.modules.xraycore

/**
 * Мост к ядру mihomo (libclash.so с чистым JNI-API).
 * Библиотека загружается с диска (файл, скачанный из репозитория ядер).
 */
object GcCore {
  @Volatile
  var loaded = false
    private set

  @Volatile
  var libPath: String? = null
    private set

  fun load(path: String): Boolean {
    synchronized(CoreRuntime) {
      MihomoFiles.activatePath(path)
      CoreRuntime.claim("mihomo")
      if (loaded) return true
      System.load(path)
      loaded = true
      libPath = path
      return true
    }
  }

  fun unload() {
    // System.unload нельзя, просто помечаем
    loaded = false
  }

  external fun gcInit(homeDir: String): String
  @JvmStatic external fun gcSetVpnService(service: Any?)
  @JvmStatic external fun gcStart(configYaml: String, fd: Int): String
  external fun gcStop()
  external fun gcVersion(): String
}
