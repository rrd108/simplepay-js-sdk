import crypto from 'crypto'
import { GooglePayPaymentData, PaymentConfig, SimplePayGooglePayRequestBody, SimplePayGooglePayResponse } from './types'
import { checkSignature, generateSignature, getSimplePayConfig, prepareRequestBody, simplepayLogger, toISO8601DateString } from './utils'

const THREE_DS_CHALLENGE_CODE = '3004'

const isAbsoluteHttpsUrl = (url: string) => {
    try {
        return new URL(url).protocol === 'https:'
    } catch {
        return false
    }
}

const isGooglePayThreeDsChallenge = (response: SimplePayGooglePayResponse) => {
    if (typeof response.redirectUrl !== 'string' || response.redirectUrl.length === 0) {
        return false
    }

    if (!Array.isArray(response.errorCodes)) {
        return false
    }

    return response.errorCodes.some((code) => String(code) === THREE_DS_CHALLENGE_CODE)
}

const makeGooglePayRequest = async (apiUrl: string, requestBody: SimplePayGooglePayRequestBody, merchantKey: string) => {
    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, merchantKey)
    simplepayLogger({ function: 'SimplePay/startGooglePay', apiUrl })

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Signature': signature,
        },
        body: bodyString,
    })

    const responseSignature = response.headers.get('Signature')
    const responseText = await response.text()

    if (!responseSignature) {
        throw new Error('Missing response signature')
    }

    if (!checkSignature(responseText, responseSignature, merchantKey)) {
        throw new Error('Invalid response signature')
    }

    const responseJSON = JSON.parse(responseText) as SimplePayGooglePayResponse

    // 3004 asks the browser to open the 3DS challenge. It is a signed handoff, not a failed charge.
    if (isGooglePayThreeDsChallenge(responseJSON)) {
        return responseJSON
    }

    if (responseJSON.errorCodes?.length) {
        throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
    }

    if (!response.ok) {
        throw new Error(`SimplePay API error: ${response.status}`)
    }

    return responseJSON
}

const startGooglePay = async (paymentData: GooglePayPaymentData, config: PaymentConfig = {}) => {
    simplepayLogger({ function: 'SimplePay/startGooglePay', orderRef: paymentData.orderRef })

    if (!paymentData.googlePayToken) {
        throw new Error('Missing Google Pay token')
    }

    const currency = paymentData.currency || 'HUF'
    if (currency === 'HUF_SZEP') {
        throw new Error('Google Pay does not support HUF_SZEP')
    }

    const { MERCHANT_KEY, MERCHANT_ID, API_URL_GOOGLE_PAY, SDK_VERSION } = getSimplePayConfig(currency)
    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
    }

    const url = config.redirectUrl || process.env.SIMPLEPAY_REDIRECT_URL || 'http://url.to.redirect'
    if (process.env.SIMPLEPAY_PRODUCTION === 'true' && !isAbsoluteHttpsUrl(url)) {
        throw new Error('Google Pay return url must be absolute https in production')
    }

    const requestBody: SimplePayGooglePayRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        googlePayToken: paymentData.googlePayToken,
        sdkVersion: SDK_VERSION,
        currency,
        total: String(paymentData.total),
        type: 'CIT',
        orderRef: paymentData.orderRef,
        url,
        customerEmail: paymentData.customerEmail,
        language: paymentData.language || 'HU',
        timeout: toISO8601DateString(new Date(Date.now() + 30 * 60 * 1000)),
    }

    if (paymentData.invoice) {
        requestBody.invoice = paymentData.invoice
    }

    return makeGooglePayRequest(API_URL_GOOGLE_PAY, requestBody, MERCHANT_KEY)
}

export { startGooglePay }
