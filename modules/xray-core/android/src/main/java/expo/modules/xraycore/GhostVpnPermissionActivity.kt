package expo.modules.xraycore

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle

class GhostVpnPermissionActivity : Activity() {

  companion object {
    private const val REQUEST_CODE = 97531

    private var callback: ((Boolean) -> Unit)? = null

    fun request(activity: Activity, onResult: (Boolean) -> Unit) {
      callback?.invoke(false)
      callback = onResult
      activity.startActivity(Intent(activity, GhostVpnPermissionActivity::class.java))
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val intent = VpnService.prepare(this)
    if (intent == null) {
      finishWith(true)
    } else {
      startActivityForResult(intent, REQUEST_CODE)
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == REQUEST_CODE) {
      finishWith(resultCode == RESULT_OK)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    callback?.invoke(false)
    callback = null
  }

  private fun finishWith(granted: Boolean) {
    val cb = callback
    callback = null
    cb?.invoke(granted)
    finish()
  }
}
