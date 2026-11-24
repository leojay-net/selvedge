package net.selvedge.wallet

import android.app.Application
import net.selvedge.wallet.data.PreferencesStorage
import net.selvedge.wallet.data.SelvedgeStore
import net.selvedge.wallet.review.ReviewService
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.signing.SeedVaultBackend
import net.selvedge.wallet.signing.ActivityLauncherBridge
import net.selvedge.wallet.signing.SigningBackend
import net.selvedge.wallet.signing.TestWalletBackend

class AppContainer(application: Application) {
    private val storage = PreferencesStorage(application)
    val store = SelvedgeStore(storage)
    val reviewService = ReviewService()
    val testWallet = TestWalletBackend(storage)
    private val applicationContext = application.applicationContext

    val seedVaultInstalled: Boolean get() = SeedVaultBackend.isInstalled(applicationContext)

    fun backendFor(kind: BackendKind, launcher: ActivityLauncherBridge): SigningBackend = when (kind) {
        BackendKind.TEST_WALLET -> testWallet
        BackendKind.SEED_VAULT -> SeedVaultBackend(applicationContext, launcher)
    }
}

class SelvedgeApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
