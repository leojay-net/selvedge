package net.selvedge.wallet

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import net.selvedge.wallet.biometric.AndroidBiometricAuthenticator
import net.selvedge.wallet.signing.ActivityLauncherBridge
import net.selvedge.wallet.signing.ActivityOutcome
import net.selvedge.wallet.ui.AppController
import net.selvedge.wallet.ui.SelvedgeRoot

class MainActivity : FragmentActivity() {
    private var pendingResult: CompletableDeferred<ActivityResult>? = null

    private val resultLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pendingResult?.complete(result)
    }

    private val launcherBridge = ActivityLauncherBridge { intent: Intent ->
        val deferred = CompletableDeferred<ActivityResult>()
        pendingResult = deferred
        resultLauncher.launch(intent)
        val result = deferred.await()
        ActivityOutcome(result.resultCode, result.data)
    }

    private lateinit var controller: AppController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as SelvedgeApplication).container
        controller = AppController(container, launcherBridge, AndroidBiometricAuthenticator(this), lifecycleScope)
        setContent { SelvedgeRoot(controller) }
    }
}
