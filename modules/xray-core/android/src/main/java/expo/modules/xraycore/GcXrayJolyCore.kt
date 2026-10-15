package expo.modules.xraycore

/** JNI bridge for the Jolymmiles/Xray-core fork. */
object GcXrayJolyCore {
  @Volatile var loaded = false
    private set
  fun load(path: String) {
    synchronized(CoreRuntime) {
      XrayJolyFiles.activatePath(path)
      CoreRuntime.claim("xray-joly")
      if (!loaded) { System.load(path); loaded = true }
    }
  }
  external fun gcInit(homeDir: String): String
  external fun gcStart(configJson: String, fd: Int): String
  external fun gcStop()
  external fun gcVersion(): String
}
