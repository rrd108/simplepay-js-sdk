import { describe, it, expect, beforeEach } from 'vitest'
import { Currency } from './types'
import { checkSignature, generateSignature, getCurrencyFromMerchantId, getSimplePayConfig, handleIpnRequest } from './utils'

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
        
        it('should generate correct signature for the SZÉP payment response', () => {
            const merchantKey = 'SZEP_KEY_SECRET'
            const response = {
                r:0, 
                t:505070183, 
                e:"SUCCESS", 
                m:"SZEP114606", 
                o:"1745669549825"
            }

            const expectedSignature = '6stvxYnjA+UUmcmsQvA4FjvgGx6MbtPleKIQVTUzA5vu+uUOyl15o9LSnFn/9WtD'
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
            expect(currencySzep).toBe('HUF_SZEP')
        })
    })

    describe('IPN Response Signature', () => {
        it('should generate valid signature for IPN response after adding receiveDate', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            // Simulate incoming IPN request body (compact JSON, no whitespace)
            const ipnRequestBody = {
                r: 0,
                t: '504233881',
                e: 'SUCCESS',
                m: 'testId',
                o: 'test-order-123'
            }
            
            // JSON.stringify produces compact JSON by default (no whitespace)
            const ipnBodyString = JSON.stringify(ipnRequestBody)
            
            // Generate valid incoming signature (as if from SimplePay)
            const incomingSignature = generateSignature(ipnBodyString, merchantKey)
            
            // Step 1: Verify incoming signature is valid
            const isIncomingSignatureValid = checkSignature(ipnBodyString, incomingSignature, merchantKey)
            expect(isIncomingSignatureValid).toBeTruthy()
            
            // Step 2: Add receiveDate property (as per IPN flow)
            const ipnResponseBody = {
                ...ipnRequestBody,
                receiveDate: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
            }
            
            // JSON.stringify produces compact JSON (no whitespace) - required by SimplePay
            const ipnResponseBodyString = JSON.stringify(ipnResponseBody)
            
            // Step 3: Generate response signature
            const responseSignature = generateSignature(ipnResponseBodyString, merchantKey)
            
            // Step 4: Verify the response signature is valid
            const isResponseSignatureValid = checkSignature(ipnResponseBodyString, responseSignature, merchantKey)
            expect(isResponseSignatureValid).toBeTruthy()
            
            // Verify response signature is different from incoming signature (since body changed)
            expect(responseSignature).not.toBe(incomingSignature)
            
            // Verify JSON is compact (no whitespace)
            expect(ipnResponseBodyString).not.toMatch(/\s/)
        })

        it('should handle IPN request using handleIpnRequest function', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            // Simulate incoming IPN request body (compact JSON, no whitespace)
            // Use a specific field order to test that it's preserved
            const ipnBodyString = '{"r":0,"t":"504233881","e":"SUCCESS","m":"testId","o":"test-order-123"}'
            const incomingSignature = generateSignature(ipnBodyString, merchantKey)
            
            // Use handleIpnRequest function
            const { responseBody, signature } = handleIpnRequest(ipnBodyString, incomingSignature, merchantKey)
            
            // Verify response contains receiveDate
            const responseData = JSON.parse(responseBody)
            expect(responseData).toHaveProperty('receiveDate')
            expect(responseData.r).toBe(0)
            expect(responseData.t).toBe('504233881')
            expect(responseData.e).toBe('SUCCESS')
            expect(responseData.m).toBe('testId')
            expect(responseData.o).toBe('test-order-123')
            
            // Verify response signature is valid
            const isSignatureValid = checkSignature(responseBody, signature, merchantKey)
            expect(isSignatureValid).toBeTruthy()
            
            // Verify JSON is compact (no whitespace) - required by SimplePay
            expect(responseBody).not.toMatch(/\s/)
            
            // Verify receiveDate is in ISO 8601 format (e.g., 2025-10-06T07:00:34+02:00)
            expect(responseData.receiveDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
            
            // Verify field order is preserved: original fields come first, receiveDate is last
            const responseBodyString = responseBody
            expect(responseBodyString).toMatch(/^\{.*"r":0,.*"t":".*",.*"e":".*",.*"m":".*",.*"o":".*",.*"receiveDate":".*"\}$/)
            // Verify receiveDate is the last field before closing brace
            expect(responseBodyString).toMatch(/"receiveDate":"[^"]*"\}$/)
        })

        it('should preserve field order in IPN response', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            // Test with a specific field order
            const ipnBodyString = '{"r":0,"t":"123","e":"SUCCESS","m":"merchantId","o":"order123"}'
            const incomingSignature = generateSignature(ipnBodyString, merchantKey)
            
            const { responseBody } = handleIpnRequest(ipnBodyString, incomingSignature, merchantKey)
            
            // Verify the original fields are in the same order
            const rIndex = responseBody.indexOf('"r":')
            const tIndex = responseBody.indexOf('"t":')
            const eIndex = responseBody.indexOf('"e":')
            const mIndex = responseBody.indexOf('"m":')
            const oIndex = responseBody.indexOf('"o":')
            const receiveDateIndex = responseBody.indexOf('"receiveDate":')
            
            // Verify order: r < t < e < m < o < receiveDate
            expect(rIndex).toBeLessThan(tIndex)
            expect(tIndex).toBeLessThan(eIndex)
            expect(eIndex).toBeLessThan(mIndex)
            expect(mIndex).toBeLessThan(oIndex)
            expect(oIndex).toBeLessThan(receiveDateIndex)
            
            // Verify receiveDate is the last field
            const lastFieldIndex = Math.max(rIndex, tIndex, eIndex, mIndex, oIndex, receiveDateIndex)
            expect(lastFieldIndex).toBe(receiveDateIndex)
        })

        it('should preserve numeric data types in IPN response', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            // Test with numeric transactionId (not string)
            // This is critical: SimplePay sends numeric values, they must stay numeric
            const ipnBodyString = '{"r":0,"t":508163884,"e":"SUCCESS","m":"testId","o":"order123"}'
            const incomingSignature = generateSignature(ipnBodyString, merchantKey)
            
            const { responseBody, signature } = handleIpnRequest(ipnBodyString, incomingSignature, merchantKey)
            
            // Verify numeric transactionId stays numeric (no quotes around the number)
            expect(responseBody).toMatch(/"t":508163884,/)
            expect(responseBody).not.toMatch(/"t":"508163884",/)
            
            // Verify response signature is valid
            const isSignatureValid = checkSignature(responseBody, signature, merchantKey)
            expect(isSignatureValid).toBeTruthy()
            
            // Verify the response can be parsed and numeric value is preserved
            const parsed = JSON.parse(responseBody)
            expect(typeof parsed.t).toBe('number')
            expect(parsed.t).toBe(508163884)
        })

        it('should preserve string data types in IPN response', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            // Test with string transactionId
            const ipnBodyString = '{"r":0,"t":"504233881","e":"SUCCESS","m":"testId","o":"order123"}'
            const incomingSignature = generateSignature(ipnBodyString, merchantKey)
            
            const { responseBody, signature } = handleIpnRequest(ipnBodyString, incomingSignature, merchantKey)
            
            // Verify string transactionId stays string (with quotes)
            expect(responseBody).toMatch(/"t":"504233881",/)
            expect(responseBody).not.toMatch(/"t":504233881,/)
            
            // Verify response signature is valid
            const isSignatureValid = checkSignature(responseBody, signature, merchantKey)
            expect(isSignatureValid).toBeTruthy()
            
            // Verify the response can be parsed and string value is preserved
            const parsed = JSON.parse(responseBody)
            expect(typeof parsed.t).toBe('string')
            expect(parsed.t).toBe('504233881')
        })

        it('should throw error for invalid incoming IPN signature', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            const ipnBodyString = JSON.stringify({ r: 0, t: '123', e: 'SUCCESS', m: 'testId', o: 'test-order' })
            const invalidSignature = 'invalid-signature'
            
            expect(() => {
                handleIpnRequest(ipnBodyString, invalidSignature, merchantKey)
            }).toThrow('Invalid IPN request signature')
        })

        it('should generate valid signature for IPN response with different currencies', () => {
            setEnv()
            
            const testCases = [
                { currency: 'HUF' as Currency, merchantKey: 'testKey', merchantId: 'testId' },
                { currency: 'EUR' as Currency, merchantKey: 'secretEuroKey', merchantId: 'merchantEuroId' },
                { currency: 'HUF_SZEP' as Currency, merchantKey: 'testKeySzep', merchantId: 'testIdSzep' }
            ]
            
            testCases.forEach(({ currency, merchantKey, merchantId }) => {
                // Use specific field order to test preservation
                const ipnBodyString = `{"r":0,"t":"504233881","e":"SUCCESS","m":"${merchantId}","o":"test-order-${currency}"}`
                const incomingSignature = generateSignature(ipnBodyString, merchantKey)
                
                // Verify incoming signature
                expect(checkSignature(ipnBodyString, incomingSignature, merchantKey)).toBeTruthy()
                
                // Use handleIpnRequest function
                const { responseBody, signature } = handleIpnRequest(ipnBodyString, incomingSignature, merchantKey)
                
                // Verify response signature
                expect(checkSignature(responseBody, signature, merchantKey)).toBeTruthy()
                
                // Verify JSON is compact (no whitespace)
                expect(responseBody).not.toMatch(/\s/)
                
                // Verify field order is preserved
                expect(responseBody).toMatch(/^\{.*"r":0,.*"t":".*",.*"e":".*",.*"m":".*",.*"o":".*",.*"receiveDate":".*"\}$/)
            })
        })

        it('should reject IPN response with invalid signature', () => {
            setEnv()
            const merchantKey = 'testKey'
            
            const ipnRequestBody = {
                r: 0,
                t: '504233881',
                e: 'SUCCESS',
                m: 'testId',
                o: 'test-order-123',
                receiveDate: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
            }
            
            // JSON.stringify produces compact JSON (no whitespace)
            const ipnResponseBodyString = JSON.stringify(ipnRequestBody)
            const invalidSignature = 'invalid-signature'
            
            const isValid = checkSignature(ipnResponseBodyString, invalidSignature, merchantKey)
            expect(isValid).toBeFalsy()
        })
    })
})
