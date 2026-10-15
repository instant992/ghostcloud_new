package expo.modules.xraycore

/**
 * Мост к ядру UwuRay (libuwuray.so — форк Xray-core от MakostaDev с расширенным
 * BT-снаффером и meta-rules-dat; чистый JNI-API, собран из core-src/gcuwu).
 * Библиотека загружается с диска (файл, скачанный из репозитория ядер).
 *
 * ВАЖНО: как и sing-box, содержит собственный Go-рантайм — в одном процессе
 *  может жить только ОДНО скачиваемое ядро (GcSbCore/GcUwuCore/GcXrayJolyCore).
 * Встроенный Xray (gomobile libXray) грузится лениво и при выбранном UwuRay
 * не трогается (пинг-проверки для не-xray ядер идут TCP-методом).
 */
object GcUwuCore {
  @Volatile
  var loaded = false
    private set

  @Volatile
  var libPath: String? = null
    private set

  fun load(path: String): Boolean {
    synchronized(CoreRuntime) {
      CoreRuntime.claim("uwuray")
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
  external fun gcStart(configJson: String, fd: Int): String
  external fun gcStop()
  external fun gcVersion(): String
}
