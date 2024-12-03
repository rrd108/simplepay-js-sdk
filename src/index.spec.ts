import { describe, it, expect, vi } from 'vitest'
import { checkSignature, generateSignature, getPaymentResponse, startPayment } from './index'
import { PaymentData } from './types'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
}

const paymentData = {
    orderRef: 'TEST123',
    customerEmail: 'test@example.com',
    total: 1212
}

describe('generateSignature', () => {
    it('should generate correct signature for sample payload from documentation', () => {
        const merchantKey = 'FxDa5w314kLlNseq2sKuVwaqZshZT5d6'
        const body = {
            salt: 'c1ca1d0e9fc2323b3dda7cf145e36f5e',
            merchant: 'PUBLICTESTHUF',
            orderRef: '101010516348232058105',
            currency: 'HUF',
            customerEmail: 'sdk_test@otpmobil.com',
            language: 'HU',
            sdkVersion: 'SimplePayV2.1_Payment_PHP_SDK_2.0.7_190701:dd236896400d7463677a82a47f53e36e',
            methods: ['CARD'],
            total: '25',
            timeout: '2021-10-30T12:30:11+00:00',
            url: 'https://sdk.simplepay.hu/back.php',
        }

        let bodyString = JSON.stringify(body)
        // after stringify we should insert backslashes for the url
        bodyString = bodyString.replace(/\//g, '\\/')

        const result = generateSignature(bodyString, merchantKey)

        const expectedSignature = 'gcDJ8J7TyT1rC/Ygj/8CihXaLwniMWRav09QSEMQUnv5TbYaEDvQAuBE1mW3plvZ'
        expect(result).toBe(expectedSignature)
    })
})


describe('checkSignature', () => {
    it('should generate correct signature for the response', () => {
        const merchantKey = 'P085602'
        const response = {
            transactionId: '504226393',
            orderRef: 'ORDER124',
            merchant: merchantKey,
            timeout: '2024-11-29T13:29:17+01:00',
            total: '1000',
            paymentUrl: 'https://sb-checkout.simplepay.hu/trx/cJZs3UUc48FlGu7Mfa1M0tcTWO53oA5RxS0OUMPqA17Fe3HGBr',
            currency: 'HUF',
            salt: 'R0ZBm2gdCXuTmxpOkqB4s0aAhZxZwSWG'
        }

        const expectedSignature = 'W98O/EdHobsWJTw2U1xUuUWXtCaJnTnzq5Na8ddCKE4gm2IW7vro33tGAW55YPf6'
        const result = checkSignature(JSON.stringify(response).replace(/\//g, '\\/'), expectedSignature, merchantKey)
        expect(result).toBeTruthy()
    })

    it('should return false for invalid signature', () => {
        const merchantKey = 'testKey'
        const response = { test: 'data' }
        const invalidSignature = 'invalid-signature'

        const result = checkSignature(
            JSON.stringify(response),
            invalidSignature,
            merchantKey
        )
        expect(result).toBeFalsy()
    })
})

describe('getPaymentResponse', () => {
    it('should correctly decode and parse valid response', () => {
        // Create a base64 encoded response similar to what SimplePay returns
        const mockResponse = {
            r: 'SUCCESS',
            t: '123456789',
            e: 'PAYMENT',
            m: 'MERCHANT123',
            o: 'ORDER123'
        }
        const encodedResponse = Buffer.from(JSON.stringify(mockResponse)).toString('base64')
        const validSignature = generateSignature(JSON.stringify(mockResponse), process.env.SIMPLEPAY_MERCHANT_KEY_HUF || '')

        const result = getPaymentResponse(encodedResponse, validSignature)

        expect(result).toEqual({
            responseCode: 'SUCCESS',
            transactionId: '123456789',
            event: 'PAYMENT',
            merchantId: 'MERCHANT123',
            orderId: 'ORDER123'
        })
    })

    it('should throw error for invalid signature', () => {
        const mockResponse = { test: 'data' }
        const encodedResponse = Buffer.from(JSON.stringify(mockResponse)).toString('base64')

        expect(() =>
            getPaymentResponse(encodedResponse, 'invalid-signature')
        ).toThrow('Invalid response signature')
    })
})

describe('startPayment', () => {
    it('should throw error when merchant configuration is missing', async () => {
        await expect(startPayment(paymentData)).rejects.toThrow('Missing SimplePay configuration')
    })

    it('should handle API errors correctly', async () => {
        setEnv()

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: {
                get: vi.fn().mockReturnValue('mockSignature')
            },
            text: vi.fn().mockResolvedValue(JSON.stringify({
                transactionId: '123456',
                total: '1212',
                merchant: 'testId'
            }))
        }) as unknown as typeof fetch
        await expect(startPayment(paymentData)).rejects.toThrow('Invalid response signature')
    })

    it('should successfully start CARD, HUF, HU payment when API returns valid response', async () => {
        setEnv()
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: {
                get: vi.fn().mockReturnValue('bxSwUc0qn0oABSRcq9uawF6zncFBhRk/AbO4HznYR9Pt5SjocyxAD+9Q4bE44h0J')
            },
            text: vi.fn().mockResolvedValue(JSON.stringify({
                transactionId: '123456',
                total: '1212',
                merchant: 'testId'
            }))
        }) as unknown as typeof fetch

        await expect(startPayment(paymentData)).resolves.toBeDefined()
    })
})

