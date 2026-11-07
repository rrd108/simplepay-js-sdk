import crypto from 'crypto'
import { CURRENCIES, Currency, ISO8601DateString, SimplePayAPIResult, SimplePayCancelCardRequestBody, SimplePayCancelCardResponse, SimplePayRecurringRequestBody, SimplePayRecurringResponse, SimplePayRequestBody, SimplePayResponse, SimplePayResult, SimplePayTokenRequestBody, SimplePayTokenResponse } from "./types"

export const simplepayLogger = (...args: any[]) => {
    if (process.env.SIMPLEPAY_LOGGER !== 'true') {
        return
    }

    console.log('👉 ', ...args)
}

export const getSimplePayConfig = (currency: Currency) => {
    if (!CURRENCIES.includes(currency)) {
        throw new Error(`Unsupported currency: ${currency}`)
    }

    const SIMPLEPAY_API_URL = 'https://secure.simplepay.hu/payment/v2'
    const SIMPLEPAY_SANDBOX_URL = 'https://sandbox.simplepay.hu/payment/v2'
    const SDK_VERSION = 'SimplePay_Rrd_1.0.0'
    const MERCHANT_KEY = process.env[`SIMPLEPAY_MERCHANT_KEY_${currency}`]
    const MERCHANT_ID = process.env[`SIMPLEPAY_MERCHANT_ID_${currency}`]

    const API_URL = process.env.SIMPLEPAY_PRODUCTION === 'true' ? SIMPLEPAY_API_URL : SIMPLEPAY_SANDBOX_URL
    const API_URL_PAYMENT = API_URL + '/start'
    const API_URL_RECURRING = API_URL + '/dorecurring'
    const API_URL_CARD_CANCEL = API_URL + '/cardcancel'
    const API_URL_GOOGLE_PAY = API_URL + '/doGooglePay'
    const API_URL_APPLE_PAY_START = API_URL + '/startapplepay'
    const API_URL_APPLE_PAY_DO = API_URL + '/doapplepay'
    return {
        MERCHANT_KEY,
        MERCHANT_ID,
        API_URL_PAYMENT,
        API_URL_RECURRING,
        API_URL_CARD_CANCEL,
        API_URL_GOOGLE_PAY,
        API_URL_APPLE_PAY_START,
        API_URL_APPLE_PAY_DO,
        SDK_VERSION
    }
}

const SANDBOX_REDIRECT_URL = 'http://url.to.redirect'

const isAbsoluteHttpsUrl = (url: string) => {
    try {
        return new URL(url).protocol === 'https:'
    } catch {
        return false
    }
}

// In production the return url must be set and absolute https; the sandbox keeps a placeholder fallback.
export const resolveRedirectUrl = (redirectUrl?: string) => {
    const url = redirectUrl || process.env.SIMPLEPAY_REDIRECT_URL
    if (process.env.SIMPLEPAY_PRODUCTION !== 'true') {
        return url || SANDBOX_REDIRECT_URL
    }

    if (!url || !isAbsoluteHttpsUrl(url)) {
        throw new Error('SimplePay return url must be absolute https in production')
    }

    return url
}

// escaping slashes for the request body to prevent strange SimplePay API errors (eg Missing Signature)
export const prepareRequestBody = (body: any) =>
    JSON.stringify(body).replace(/\//g, '\\/')

export const generateSignature = (body: string, merchantKey: string) => {
    const key = typeof merchantKey === 'string' ? merchantKey.trim() : ''
    if (!key) {
        throw new Error('Missing merchant key')
    }

    const hmac = crypto.createHmac('sha384', key)
    hmac.update(body, 'utf8')
    return hmac.digest('base64')
}

export const checkSignature = (responseText: string, signature: string, merchantKey: string) => {
    const expected = Buffer.from(generateSignature(responseText, merchantKey), 'utf8')
    if (typeof signature !== 'string') {
        return false
    }

    const received = Buffer.from(signature, 'utf8')
    if (received.length !== expected.length) {
        return false
    }

    return crypto.timingSafeEqual(received, expected)
}

export const toISO8601DateString = (date: Date): ISO8601DateString => date.toISOString().replace(/\.\d{3}Z$/, '+00:00')

export const getCurrencyFromMerchantId = (merchantId: string) => {
    const currency = Object.entries(process.env)
        .find(([key, value]) =>
            key.startsWith('SIMPLEPAY_MERCHANT_ID_') && value === merchantId
        )?.[0]?.replace('SIMPLEPAY_MERCHANT_ID_', '') as Currency

    if (!currency) {
        throw new Error(`Merchant id not found in the environment: ${merchantId}`)
    }

    return currency
}

export const makeSimplePayRequest = async (apiUrl: string, requestBody: SimplePayRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey, 'oneTime') as Promise<SimplePayResponse>
}

export const makeSimplePayRecurringRequest = async (apiUrl: string, requestBody: SimplePayRecurringRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey, 'recurring') as Promise<SimplePayRecurringResponse>
}

export const makeSimplePayTokenRequest = async (apiUrl: string, requestBody: SimplePayTokenRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey, 'token') as Promise<SimplePayTokenResponse>
}

export const makeSimplePayCancelCardRequest = async (apiUrl: string, requestBody: SimplePayCancelCardRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey, 'cancelCard') as Promise<SimplePayCancelCardResponse>
}

const makeRequest = async (apiUrl: string, requestBody: SimplePayRequestBody | SimplePayRecurringRequestBody | SimplePayTokenRequestBody | SimplePayCancelCardRequestBody, merchantKey: string, type: 'oneTime' | 'recurring' | 'token' | 'cancelCard') => {
    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, merchantKey)
    simplepayLogger({ function: `SimplePay/makeRequest/${type}`, apiUrl, orderRef: (requestBody as { orderRef?: string }).orderRef })

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Signature': signature,
            },
            body: bodyString,
        })

        simplepayLogger({ function: `SimplePay/makeRequest/${type}`, status: response.status })

        if (!response.ok) {
            throw new Error(`SimplePay API error: ${response.status}`)
        }

        const responseSignature = response.headers.get('Signature')
        if (!responseSignature) {
            throw new Error('Missing response signature')
        }

        const responseText = await response.text()
        if (!checkSignature(responseText, responseSignature, merchantKey)) {
            throw new Error('Invalid response signature')
        }

        const responseJSON = JSON.parse(responseText) as { errorCodes?: string[] }
        simplepayLogger({ function: `SimplePay/makeRequest/${type}`, errorCodes: responseJSON.errorCodes })

        if (responseJSON.errorCodes) {
            throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
        }

        return responseJSON

    } catch (error) {
        throw error
    }
}

export const getPaymentResponse = (r: string, signature: string) => {
    simplepayLogger({ function: 'SimplePay/getPaymentResponse' })
    signature = signature.replace(/ /g, '+')
    const rDecoded = Buffer.from(r, 'base64').toString('utf-8')
    const rDecodedJSON = JSON.parse(rDecoded) as SimplePayAPIResult
    const currency = getCurrencyFromMerchantId(rDecodedJSON.m)
    const { MERCHANT_KEY } = getSimplePayConfig(currency as Currency)
    if (!MERCHANT_KEY) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
    }

    if (!checkSignature(rDecoded, signature, MERCHANT_KEY)) {
        simplepayLogger({ function: 'SimplePay/getPaymentResponse', error: 'Invalid response signature', orderRef: rDecodedJSON.o })
        throw new Error('Invalid response signature')
    }

    const responseJson = JSON.parse(rDecoded)
    const response: SimplePayResult = {
        responseCode: responseJson.r,
        transactionId: responseJson.t,
        event: responseJson.e,
        merchantId: responseJson.m,
        orderRef: responseJson.o,
        tokens: responseJson.tokens,
    }

    return response
}

/**
 * Handles IPN (Instant Payment Notification) request and generates response
 * 
 * This function implements the IPN flow according to SimplePay requirements:
 * 1. Validates the incoming signature
 * 2. Adds receiveDate property to the response (preserving original field order and data types)
 * 3. Generates response signature
 * 
 * **IMPORTANT**: The responseBody must be sent EXACTLY as returned, without any modifications.
 * Do NOT:
 * - Re-format or pretty-print the JSON
 * - Parse and re-stringify the JSON
 * - Add any whitespace or formatting
 * - Modify the Content-Type header (must be 'application/json')
 * 
 * The signature is calculated on the exact string that will be sent in the HTTP body.
 * Any modification to the responseBody will invalidate the signature.
 * 
 * @param ipnBody - The raw IPN request body as string (must be the exact string received, not parsed JSON)
 * @param incomingSignature - The signature from the 'Signature' HTTP header
 * @param merchantKey - The merchant secret key for signature validation and generation
 * @returns Object containing the response JSON string and signature to send back
 * 
 * @example
 * // In your IPN endpoint handler:
 * const ipnBody = await request.text() // Get raw body as string (IMPORTANT: use .text(), not JSON.parse())
 * const incomingSignature = request.headers.get('Signature')
 * const { responseBody, signature } = handleIpnRequest(ipnBody, incomingSignature, MERCHANT_KEY)
 * 
 * // Send response with HTTP 200 status
 * // CRITICAL: Send responseBody exactly as returned, do not modify it!
 * return new Response(responseBody, {
 *   status: 200,
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Signature': signature
 *   }
 * })
 */
export const handleIpnRequest = (ipnBody: string, incomingSignature: string, merchantKey: string) => {
    simplepayLogger({ function: 'SimplePay/handleIpnRequest' })

    // Step 1: Validate incoming signature
    if (!checkSignature(ipnBody, incomingSignature, merchantKey)) {
        throw new Error('Invalid IPN request signature')
    }
    
    // Step 2: Validate it's a JSON object (but don't use parsed object to preserve field order and data types)
    const parsed = JSON.parse(ipnBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid IPN request body')
    }

    // Step 3: Add receiveDate to the original JSON string while preserving:
    // - Exact field order
    // - Exact data types (numeric vs string)
    // - No whitespace (compact JSON)
    // Insert before the object's own closing brace, which is the last '}' in the body.
    // The first '}' could belong to a nested object or sit inside a string value.
    const receiveDate = toISO8601DateString(new Date())
    const body = ipnBody.trimEnd()
    const closingBrace = body.length - 1
    const separator = Object.keys(parsed).length > 0 ? ',' : ''
    const responseBody = `${body.slice(0, closingBrace)}${separator}"receiveDate":"${receiveDate}"}`

    // Step 4: Generate response signature using SHA384 HMAC + Base64
    // The signature must be calculated on the exact string that will be sent
    const responseSignature = generateSignature(responseBody, merchantKey)
    
    simplepayLogger({ function: 'SimplePay/handleIpnRequest', receiveDate })
    
    return {
        responseBody,
        signature: responseSignature
    }
}
