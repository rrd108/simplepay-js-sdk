import crypto from 'crypto'
import { SimplePayRecurringRequestBody, RecurringPaymentData, TokenPaymentData, SimplePayTokenRequestBody} from './types'
import { getSimplePayConfig, simplepayLogger, toISO8601DateString, makeSimplePayTokenRequest, makeSimplePayRecurringRequest} from './utils'

const INTERVAL_IN_MONTHS = 6
const DEFAULT_UNTIL = new Date(Date.now() + INTERVAL_IN_MONTHS * 30 * 24 * 60 * 60 * 1000)
const DEFAULT_MAX_AMOUNT = 12000
const DEFAULT_TIMES = 3

const startRecurringPayment = async (paymentData: RecurringPaymentData) => {
    simplepayLogger({ function: 'SimplePay/startRecurringPayment', paymentData })
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ function: 'SimplePay/startRecurringPayment', MERCHANT_KEY, MERCHANT_ID, API_URL })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
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

   return makeSimplePayRecurringRequest(API_URL, requestBody, MERCHANT_KEY)
}

const startTokenPayment = async (paymentData: TokenPaymentData) => {
    simplepayLogger({ function: 'SimplePay/startTokenPayment', paymentData })
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL_RECURRING, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ function: 'SimplePay/startTokenPayment', MERCHANT_KEY, MERCHANT_ID, API_URL_RECURRING })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error(`Missing SimplePay configuration for ${currency}`)
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
        url: process.env.SIMPLEPAY_REDIRECT_URL || 'http://recurring.url.to.redirect',
        invoice: paymentData.invoice,
    }

  return makeSimplePayTokenRequest(API_URL_RECURRING, requestBody, MERCHANT_KEY)
}

export { startRecurringPayment, startTokenPayment }