package expo.modules.xraycore

/** Reservations remain until process death, even if initialization fails. */
object CoreRuntime {
  private var owner: String? = null
  @Synchronized fun claim(core: String) {
    check(owner == null || owner == core) { "Другое ядро уже загружено — перезапустите приложение" }
    owner = core
  }
  @Synchronized fun owns(core: String): Boolean = owner == core
  @Synchronized fun isLoadedFile(name: String): Boolean = when (name) {
    "libxraylast.so" -> owner == "xray-last"
    "libsingbox.so" -> owner == "singbox"
    "libuwuray.so" -> owner == "uwuray"
    "libclash.so" -> owner == "mihomo"
    else -> false
  }
}
