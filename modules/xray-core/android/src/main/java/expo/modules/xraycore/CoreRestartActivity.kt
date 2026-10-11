package expo.modules.xraycore

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process

/** Lives outside the core process so Android can start a genuinely fresh Go runtime. */
class CoreRestartActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val oldPid = intent.getIntExtra("oldPid", -1)
    if (oldPid <= 0 || oldPid == Process.myPid()) { finish(); return }
    Process.killProcess(oldPid)
    val handler = Handler(Looper.getMainLooper())
    var attempts = 0
    fun launchWhenDead() {
      if (java.io.File("/proc/$oldPid").exists() && attempts++ < 50) {
        handler.postDelayed({ launchWhenDead() }, 100)
        return
      }
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(launch)
      }
      finish()
      handler.postDelayed({ Process.killProcess(Process.myPid()) }, 500)
    }
    handler.postDelayed({ launchWhenDead() }, 100)
  }
}
