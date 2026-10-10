package expo.modules.xraycore

/** Unique JNI namespace for the pinned official upstream c-shared library. */
object GcXrayLastCore {
  @Volatile var loaded = false
    private set
  fun load(path: String) {
    synchronized(CoreRuntime) {
      XrayLastFiles.activatePath(path)
      CoreRuntime.claim("xray-last")
      if (!loaded) { System.load(path); loaded = true }
    }
  }
  external fun gcInit(homeDir: String): String
  external fun gcStart(configJson: String, fd: Int): String
  external fun gcStop()
  external fun gcVersion(): String
}
