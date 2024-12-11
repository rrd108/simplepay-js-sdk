import crypto from 'crypto'
import { CURRENCIES, Currency, ISO8601DateString, SimplePayRecurringRequestBody, SimplePayRecurringResponse, SimplePayRequestBody, SimplePayResponse, SimplePayTokenRequestBody, SimplePayTokenResponse } from "./types"

export const simplepayLogger = (...args: any[]) => {
    if (process.env.SIMPLEPAY_LOGGER !== 'true') {
        return
    }
    console.log(...args)
}

export const getSimplePayConfig = (currency: Currency) => {
    if (!CURRENCIES.includes(currency)) {
        throw new Error(`Unsupported currency: ${currency}`)
    }

    const SIMPLEPAY_API_URL = 'https://secure.simplepay.hu/payment/v2'
    const SIMPLEPAY_SANDBOX_URL = 'https://sandbox.simplepay.hu/payment/v2/start'
    const SDK_VERSION = 'SimplePayV2.1_Rrd_0.6.1'
    const MERCHANT_KEY = process.env[`SIMPLEPAY_MERCHANT_KEY_${currency}`]
    const MERCHANT_ID = process.env[`SIMPLEPAY_MERCHANT_ID_${currency}`]
    const API_URL = process.env.SIMPLEPAY_PRODUCTION === 'true' ? SIMPLEPAY_API_URL : SIMPLEPAY_SANDBOX_URL
    const API_URL_RECURRING = process.env.SIMPLEPAY_PRODUCTION === 'true' ? SIMPLEPAY_API_URL : 'https://sandbox.simplepay.hu/payment/v2/dorecurring'

    return {
        MERCHANT_KEY,
        MERCHANT_ID,
        API_URL,
        API_URL_RECURRING,
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
    return makeRequest(apiUrl, requestBody, merchantKey) as Promise<SimplePayResponse>
}

export const makeSimplePayRecurringRequest = async (apiUrl: string, requestBody: SimplePayRecurringRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey) as Promise<SimplePayRecurringResponse>
}

export const makeSimplePayTokenRequest = async (apiUrl: string, requestBody: SimplePayTokenRequestBody, merchantKey: string) => {
    return makeRequest(apiUrl, requestBody, merchantKey) as Promise<SimplePayTokenResponse>
}

const makeRequest = async (apiUrl: string, requestBody: SimplePayRequestBody | SimplePayRecurringRequestBody | SimplePayTokenRequestBody, merchantKey: string) => {
    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, merchantKey)
    simplepayLogger({ bodyString, signature })

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Signature': signature,
            },
            body: bodyString,
        })

        simplepayLogger({ response })

        if (!response.ok) {
            throw new Error(`SimplePay API error: ${response.status}`)
        }

        const responseSignature = response.headers.get('Signature')
        simplepayLogger({ responseSignature })
        if (!responseSignature) {
            throw new Error('Missing response signature')
        }

        const responseText = await response.text()
        const responseJSON = JSON.parse(responseText) as { errorCodes?: string[] }
        simplepayLogger({ responseText, responseJSON })

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

