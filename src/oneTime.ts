import crypto from 'crypto'
import { PaymentData, SimplePayRequestBody } from './types'
import { simplepayLogger, getSimplePayConfig, toISO8601DateString, makeSimplePayRequest } from './utils'

const startPayment = async (paymentData: PaymentData) => {
    simplepayLogger({  paymentData })
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ MERCHANT_KEY, MERCHANT_ID, API_URL })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
    }

    const requestBody: SimplePayRequestBody = {
        salt: crypto.randomBytes(16).toString('hex'),
        merchant: MERCHANT_ID,
        orderRef: paymentData.orderRef,
        currency,
        customerEmail: paymentData.customerEmail,
        language: paymentData.language || 'HU',
        sdkVersion: SDK_VERSION,
        methods: [paymentData.method || 'CARD'],
        total: String(paymentData.total),
        timeout: toISO8601DateString(new Date(Date.now() + 30 * 60 * 1000)),
        url: process.env.SIMPLEPAY_REDIRECT_URL || 'http://url.to.redirect',
        invoice: paymentData.invoice,
    }

    return makeSimplePayRequest(API_URL, requestBody, MERCHANT_KEY)
}

export { startPayment }
