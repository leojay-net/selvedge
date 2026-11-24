package net.selvedge.wallet.biometric

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

sealed interface BiometricResult {
    data object Success : BiometricResult
    data class Failure(val reason: String) : BiometricResult
    data class Unavailable(val reason: String) : BiometricResult
}

interface BiometricAuthenticator {
    suspend fun authenticate(title: String, subtitle: String): BiometricResult
}

/** Strong biometrics only: there is no device PIN fallback, so a danger override can never be bypassed. */
class AndroidBiometricAuthenticator(private val activity: FragmentActivity) : BiometricAuthenticator {
    private val allowedAuthenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG

    private fun unavailabilityReason(): String? = when (BiometricManager.from(activity).canAuthenticate(allowedAuthenticators)) {
        BiometricManager.BIOMETRIC_SUCCESS -> null
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "No fingerprint or face is enrolled on this device."
        BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "This device has no strong biometric sensor."
        BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "The biometric sensor is unavailable right now."
        else -> "Strong biometric authentication is not supported on this device."
    }

    override suspend fun authenticate(title: String, subtitle: String): BiometricResult {
        unavailabilityReason()?.let { reason -> return BiometricResult.Unavailable(reason) }
        return suspendCancellableCoroutine { continuation ->
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (continuation.isActive) continuation.resume(BiometricResult.Success)
                }

                override fun onAuthenticationError(errorCode: Int, errorMessage: CharSequence) {
                    if (continuation.isActive) continuation.resume(BiometricResult.Failure(errorMessage.toString()))
                }
            }
            val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback)
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(allowedAuthenticators)
                .setNegativeButtonText("Cancel")
                .setConfirmationRequired(true)
                .build()
            continuation.invokeOnCancellation { prompt.cancelAuthentication() }
            prompt.authenticate(promptInfo)
        }
    }
}
