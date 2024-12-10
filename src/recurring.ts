import crypto from 'crypto'
import { SimplePayRecurringResponse, SimplePayRecurringRequestBody, RecurringPaymentData, TokenPaymentData, SimplePayTokenRequestBody, SimplePayTokenResponse } from './types'
import { getSimplePayConfig, simplepayLogger, prepareRequestBody, generateSignature, checkSignature, toISO8601DateString} from './utils'
import { getPaymentResponse } from '.'

const INTERVAL_IN_MONTHS = 6
const DEFAULT_UNTIL = new Date(Date.now() + INTERVAL_IN_MONTHS * 30 * 24 * 60 * 60 * 1000)
const DEFAULT_MAX_AMOUNT = 12000
const DEFAULT_TIMES = 3

const startRecurringPayment = async (paymentData: RecurringPaymentData) => {
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ MERCHANT_KEY, MERCHANT_ID, API_URL })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error('Missing SimplePay configuration')
    }

    const requestBody: SimplePayRecurringRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        orderRef: paymentData.orderRef,
        currency,
        customer: paymentData.customer,
        customerEmail: paymentData.customerEmail,
        language: paymentData.language || 'HU',
        sdkVersion: SDK_VERSION,
        methods: ['CARD'],
        recurring: {
            times: paymentData.recurring.times || DEFAULT_TIMES,
            until: paymentData.recurring.until || toISO8601DateString(DEFAULT_UNTIL),
            maxAmount: paymentData.recurring.maxAmount || DEFAULT_MAX_AMOUNT
        },
        threeDSReqAuthMethod: '02', 
        total: String(paymentData.total),
        timeout: toISO8601DateString(new Date(Date.now() + 30 * 60 * 1000)),
        url: process.env.SIMPLEPAY_REDIRECT_URL || 'http://url.to.redirect',
        invoice: paymentData.invoice,
    }

    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, MERCHANT_KEY)
    simplepayLogger({ bodyString, signature })

    try {
        const response = await fetch(API_URL, {
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
        const responseJSON = JSON.parse(responseText) as SimplePayRecurringResponse
        simplepayLogger({ responseText, responseJSON })

        if (responseJSON.errorCodes) {
            throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
        }

        if (!checkSignature(responseText, responseSignature, MERCHANT_KEY)) {
            throw new Error('Invalid response signature')
        }

        return responseJSON

    } catch (error) {
        throw error
    }
}

const startTokenPayment = async (paymentData: TokenPaymentData) => {
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ MERCHANT_KEY, MERCHANT_ID, API_URL })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error('Missing SimplePay configuration')
    }

    const requestBody: SimplePayTokenRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        orderRef: paymentData.orderRef,
        currency,
        customer: paymentData.customer,
        customerEmail: paymentData.customerEmail,
        language: paymentData.language || 'HU',
        sdkVersion: SDK_VERSION,
        methods: ['CARD'],
        token: paymentData.token,
        type: 'MIT',
        threeDSReqAuthMethod: '02',
        total: String(paymentData.total),
        timeout: toISO8601DateString(new Date(Date.now() + 30 * 60 * 1000)),
        url: process.env.SIMPLEPAY_REDIRECT_URL || 'http://url.to.redirect',
        invoice: paymentData.invoice,
    }

    const bodyString = prepareRequestBody(requestBody)
    const signature = generateSignature(bodyString, MERCHANT_KEY)
    simplepayLogger({ bodyString, signature })

    try {
        const response = await fetch(API_URL, {
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
        const responseJSON = JSON.parse(responseText) as SimplePayTokenResponse
        simplepayLogger({ responseText, responseJSON })

        if (responseJSON.errorCodes) {
            throw new Error(`SimplePay API error: ${responseJSON.errorCodes}`)
        }

        if (!checkSignature(responseText, responseSignature, MERCHANT_KEY)) {
            throw new Error('Invalid response signature')
        }

        return responseJSON

    } catch (error) {
        throw error
    }
}

const getRecurringPaymentResponse = (r: string, signature: string) => getPaymentResponse(r, signature)

export { startRecurringPayment, getRecurringPaymentResponse, startTokenPayment }