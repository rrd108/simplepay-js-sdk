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
    const SDK_VERSION = 'SimplePay_Rrd_0.11.0'
    const MERCHANT_KEY = process.env[`SIMPLEPAY_MERCHANT_KEY_${currency}`]
    const MERCHANT_ID = process.env[`SIMPLEPAY_MERCHANT_ID_${currency}`]

    const API_URL = process.env.SIMPLEPAY_PRODUCTION === 'true' ? SIMPLEPAY_API_URL : SIMPLEPAY_SANDBOX_URL
    const API_URL_PAYMENT = API_URL + '/start'
    const API_URL_RECURRING = API_URL + '/dorecurring'
    const API_URL_CARD_CANCEL = API_URL + '/cardcancel'
    return {
        MERCHANT_KEY,
        MERCHANT_ID,
        API_URL_PAYMENT,
        API_URL_RECURRING,
        API_URL_CARD_CANCEL,
        SDK_VERSION
    }
}

// escaping slashes for the request body to prevent strange SimplePay API errors (eg Missing Signature)
export const prepareRequestBody = (body: any) =>
    JSON.stringify(body).replace(/\//g, '\\/')

export const generateSignature = (body: string, merchantKey: string) => {
    const hmac = crypto.createHmac('sha384', merchantKey.trim())
    hmac.update(body, 'utf8')
    return hmac.digest('base64')
}

export const checkSignature = (responseText: string, signature: string, merchantKey: string) =>
    signature === generateSignature(responseText, merchantKey)

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
    simplepayLogger({ function: `SimplePay/makeRequest/${type}`, bodyString, signature })

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Signature': signature,
            },
            body: bodyString,
        })

        simplepayLogger({ function: `SimplePay/makeRequest/${type}`, response })

        if (!response.ok) {
            throw new Error(`SimplePay API error: ${response.status}`)
        }

        const responseSignature = response.headers.get('Signature')
        simplepayLogger({ function: `SimplePay/makeRequest/${type}`, responseSignature })
        if (!responseSignature) {
            throw new Error('Missing response signature')
        }

        const responseText = await response.text()
        const responseJSON = JSON.parse(responseText) as { errorCodes?: string[] }
        simplepayLogger({ function: `SimplePay/makeRequest/${type}`, responseText, responseJSON })

        if (responseJSON.errorCodes) {
            throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
        }

        if (!checkSignature(responseText, responseSignature, merchantKey)) {
            throw new Error('Invalid response signature')
        }

        return responseJSON

    } catch (error) {
        throw error
    }
}

export const getPaymentResponse = (r: string, signature: string) => {
    simplepayLogger({ function: 'SimplePay/getPaymentResponse', r, signature })
    signature = decodeURIComponent(signature)
    const rDecoded = Buffer.from(r, 'base64').toString('utf-8')
    const rDecodedJSON = JSON.parse(rDecoded) as SimplePayAPIResult
    const currency = getCurrencyFromMerchantId(rDecodedJSON.m)
    const { MERCHANT_KEY } = getSimplePayConfig(currency as Currency)

    if (!checkSignature(rDecoded, signature, MERCHANT_KEY || '')) {
        simplepayLogger({ function: 'SimplePay/getPaymentResponse', rDecoded, signature })
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
