package expo.modules.xraycore

/**
 * Мост к ядру sing-box (libsingbox.so с чистым JNI-API, собран из SagerNet/sing-box).
 * Библиотека загружается с диска (файл, скачанный из репозитория ядер).
 */
object GcSbCore {
  @Volatile
  var loaded = false
    private set

  @Volatile
  var libPath: String? = null
    private set

  fun load(path: String): Boolean {
    synchronized(this) {
      if (loaded && libPath == path) return true
      System.load(path)
      loaded = true
      libPath = path
      return true
    }
  }

  external fun gcInit(homeDir: String): String
  external fun gcStart(configJson: String, fd: Int): String
  external fun gcStop()
  external fun gcVersion(): String
}
