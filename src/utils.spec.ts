import { describe, it, expect, beforeEach } from 'vitest'
import { Currency } from './types'
import { checkSignature, generateSignature, getCurrencyFromMerchantId, getSimplePayConfig } from './utils'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP = 'testIdSzep'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP = 'testKeySzep'
    process.env.SIMPLEPAY_MERCHANT_ID_EUR = 'merchantEuroId'
    process.env.SIMPLEPAY_MERCHANT_KEY_EUR = 'secretEuroKey'
}

const paymentData = {
    orderRef: 'TEST123',
    customerEmail: 'test@example.com',
    total: 1212
}
describe('SimplePay Utils Tests', () => {
    beforeEach(() => {
        // Clear all environment variables before each test
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_ID_EUR
        delete process.env.SIMPLEPAY_MERCHANT_KEY_EUR
    })
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

    describe('getSimplePayConfig', () => {
        it('should return correct config for HUF currency', () => {
            setEnv()
            const config = getSimplePayConfig('HUF')
            expect(config.MERCHANT_ID).toBe('testId')
            expect(config.MERCHANT_KEY).toBe('testKey')
        })
        
        it('should return correct config for HUF_SZEP', () => {
            setEnv()
            const config = getSimplePayConfig('HUF_SZEP')
            expect(config.MERCHANT_ID).toBe('testIdSzep')
            expect(config.MERCHANT_KEY).toBe('testKeySzep')
        })

        it('should throw error for unsupported currency', () => {
            expect(() => getSimplePayConfig('GBP' as Currency)).toThrow('Unsupported currency: GBP')
        })
    })

    const mockResponse = {
        r: 'SUCCESS',
        t: '123456789',
        e: 'PAYMENT',
        m: 'testId',
        o: 'ORDER123'
    }

    describe('getCurrencyFromMerchantId', () => {
        it('should return correct currency for merchantId', () => {
            setEnv()
            const currency = getCurrencyFromMerchantId('testId')
            expect(currency).toBe('HUF')
            
            const currencySzep = getCurrencyFromMerchantId('testIdSzep')
            expect(currencySzep).toBe('HUF')
        })
    })
})
