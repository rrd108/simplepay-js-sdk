import crypto from 'crypto'
import { PaymentData, SimplePayRequestBody, SimplePayResponse, SimplepayResult, Currency, CURRENCIES } from './types'
import { simplepayLogger, getSimplePayConfig, prepareRequestBody, generateSignature, checkSignature, toISO8601DateString, getCurrencyFromMerchantId } from './utils'

const startPayment = async (paymentData: PaymentData) => {
    const currency = paymentData.currency || 'HUF'
    const { MERCHANT_KEY, MERCHANT_ID, API_URL, SDK_VERSION } = getSimplePayConfig(currency)
    simplepayLogger({ MERCHANT_KEY, MERCHANT_ID, API_URL })

    if (!MERCHANT_KEY || !MERCHANT_ID) {
        throw new Error('Missing SimplePay configuration')
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
        const responseJSON = JSON.parse(responseText) as SimplePayResponse
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

const getPaymentResponse = (r: string, signature: string) => {
    signature = decodeURIComponent(signature)
    const rDecoded = Buffer.from(r, 'base64').toString('utf-8')
    const rDecodedJSON = JSON.parse(rDecoded)
    const currency = getCurrencyFromMerchantId(rDecodedJSON.m)
    const { MERCHANT_KEY } = getSimplePayConfig(currency as Currency)

    if (!checkSignature(rDecoded, signature, MERCHANT_KEY || '')) {
        simplepayLogger({ rDecoded, signature })
        throw new Error('Invalid response signature')
    }

    const responseJson: SimplepayResult = JSON.parse(rDecoded)
    const response = {
        responseCode: responseJson.r,
        transactionId: responseJson.t,
        event: responseJson.e,
        merchantId: responseJson.m,
        orderRef: responseJson.o,
    }

    return response
}

export {
    startPayment,
    getPaymentResponse
}