package net.selvedge.wallet.mwa

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import net.selvedge.wallet.SelvedgeApplication
import net.selvedge.wallet.biometric.AndroidBiometricAuthenticator
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.signing.ActivityLauncherBridge
import net.selvedge.wallet.signing.ActivityOutcome
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeTheme
import net.selvedge.wallet.theme.SelvedgeType
import net.selvedge.wallet.ui.BrandHeader
import net.selvedge.wallet.ui.ButtonKind
import net.selvedge.wallet.ui.ScreenColumn
import net.selvedge.wallet.ui.SelvedgeButton
import net.selvedge.wallet.ui.StatusBanner
import net.selvedge.wallet.ui.TransactionReviewScreen

class MwaActivity : FragmentActivity() {
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

    private var session: MwaSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as SelvedgeApplication).container
        val activeSession = MwaSession(this, container, launcherBridge, AndroidBiometricAuthenticator(this), lifecycleScope) { finish() }
        session = activeSession
        setContent { SelvedgeTheme { MwaContent(activeSession) { finish() } } }
        val associationUri = intent?.data
        if (associationUri != null) activeSession.start(associationUri) else finish()
    }

    override fun onDestroy() {
        session?.close()
        super.onDestroy()
    }
}

@Composable
private fun MwaContent(session: MwaSession, onClose: () -> Unit) {
    when (val screen = session.screen) {
        MwaScreen.Waiting -> ScreenColumn {
            BrandHeader()
            BasicText("Waiting for the app that opened Selvedge.", style = SelvedgeType.body)
        }
        is MwaScreen.Authorize -> ScreenColumn {
            BrandHeader()
            BasicText("${screen.dappName} wants to connect", style = SelvedgeType.large)
            BasicText("It will see your public key and can ask Selvedge to sign. Every transaction is reviewed before it is signed.", style = SelvedgeType.body)
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                SelvedgeButton("Connect", { session.approveAuthorization(screen.request, screen.connection) }, icon = AppIcon.CHECK)
                SelvedgeButton("Decline", { session.declineAuthorization(screen.request) }, kind = ButtonKind.SECONDARY)
            }
        }
        is MwaScreen.Review -> Column {
            TransactionReviewScreen(screen.flow, onFinished = { session.reviewFinished(screen.flow) })
        }
        is MwaScreen.Problem -> ScreenColumn {
            BrandHeader()
            StatusBanner(screen.message, SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
            SelvedgeButton("Close", onClose, kind = ButtonKind.SECONDARY)
        }
    }
}
