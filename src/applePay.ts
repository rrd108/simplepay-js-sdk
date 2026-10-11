import crypto from 'crypto'
import { ApplePayChargeData, ApplePayMerchantSession, ApplePayStartData, SimplePayApplePayChargeRequestBody, SimplePayApplePayChargeResponse, SimplePayApplePayStartRequestBody, SimplePayApplePayStartResponse } from './types'
import { checkSignature, generateSignature, getSimplePayConfig, prepareRequestBody, simplepayLogger, toISO8601DateString } from './utils'

const MAX_APPLE_PAY_TOKEN_LENGTH = 100_000
const APPLE_PAY_SUCCESS = 'STATUS_SUCCESS'

const isRegisteredDomain = (domain: string) => {
    if (domain.length === 0 || domain.length > 253 || domain !== domain.trim()) {
        return false
    }

    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)
}

const isBase64Token = (value: string) => {
    if (value.length === 0 || value.length > MAX_APPLE_PAY_TOKEN_LENGTH || value.length % 4 !== 0) {
        return false
    }

    return /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

const toTransactionId = (value: string | number) => {
    const id = typeof value === 'number' ? value : Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Invalid Apple Pay transaction id')
    }

    return id
}

const isMerchantSession = (session: ApplePayMerchantSession | undefined): session is ApplePayMerchantSession => {
    if (!session || typeof session !== 'object') {
        return false
    }

    return typeof session.merchantSessionIdentifier === 'string' && session.merchantSessionIdentifier.length > 0
}

const makeApplePayRequest = async <TResponse extends { errorCodes?: Array<string | number> }>(
    apiUrl: string,
    requestBody: SimplePayApplePayStartRequestBody | SimplePayApplePayChargeRequestBody,
    merchantKey: string,
    name: 'startApplePay' | 'doApplePay',
) => {
    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, merchantKey)
    simplepayLogger({ function: `SimplePay/${name}`, apiUrl })

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

    const responseJSON = JSON.parse(responseText) as TResponse

    if (responseJSON.errorCodes?.length) {
        throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
    }

    if (!response.ok) {
        throw new Error(`SimplePay API error: ${response.status}`)
    }

    return responseJSON
}

const startApplePay = async (paymentData: ApplePayStartData) => {
    simplepayLogger({ function: 'SimplePay/startApplePay', orderRef: paymentData.orderRef })

    if (!isRegisteredDomain(paymentData.domain)) {
        throw new Error('Apple Pay domain must be the registered FQDN')
    }

    const currency = paymentData.currency || 'HUF'
    if (currency === 'HUF_SZEP') {
        throw new Error('Apple Pay does not support HUF_SZEP')
    }

    const { MERCHANT_KEY, MERCHANT_ID, API_URL_APPLE_PAY_START, SDK_VERSION } = getSimplePayConfig(currency)
    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
    }

    const requestBody: SimplePayApplePayStartRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        orderRef: paymentData.orderRef,
        currency,
        domain: paymentData.domain,
        sdkVersion: SDK_VERSION,
        total: String(paymentData.total),
        customerEmail: paymentData.customerEmail,
        language: paymentData.language || 'HU',
        timeout: toISO8601DateString(new Date(Date.now() + 30 * 60 * 1000)),
    }

    if (paymentData.invoice) {
        requestBody.invoice = paymentData.invoice
    }

    const response = await makeApplePayRequest<SimplePayApplePayStartResponse>(
        API_URL_APPLE_PAY_START,
        requestBody,
        MERCHANT_KEY,
        'startApplePay',
    )

    if (!isMerchantSession(response.applePaySession)) {
        throw new Error('Missing Apple Pay session')
    }

    return response
}

const doApplePay = async (paymentData: ApplePayChargeData) => {
    const transactionId = toTransactionId(paymentData.transactionId)
    simplepayLogger({ function: 'SimplePay/doApplePay', transactionId })

    if (!isBase64Token(paymentData.applePayToken)) {
        throw new Error('Missing Apple Pay token')
    }

    const currency = paymentData.currency || 'HUF'
    if (currency === 'HUF_SZEP') {
        throw new Error('Apple Pay does not support HUF_SZEP')
    }

    const { MERCHANT_KEY, MERCHANT_ID, API_URL_APPLE_PAY_DO, SDK_VERSION } = getSimplePayConfig(currency)
    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
    }

    const requestBody: SimplePayApplePayChargeRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        transactionId,
        applePayToken: paymentData.applePayToken,
        sdkVersion: SDK_VERSION,
        currency,
    }

    const response = await makeApplePayRequest<SimplePayApplePayChargeResponse>(
        API_URL_APPLE_PAY_DO,
        requestBody,
        MERCHANT_KEY,
        'doApplePay',
    )

    if (response.applePayStatus !== APPLE_PAY_SUCCESS) {
        throw new Error('Apple Pay authorization failed')
    }

    return response
}

export { doApplePay, startApplePay }
