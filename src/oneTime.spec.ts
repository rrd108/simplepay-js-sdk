import crypto from 'crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPaymentResponse, startPayment } from './index'

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
describe('SimplePay SDK Tests', () => {
    beforeEach(() => {
        // Clear all environment variables before each test
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_ID_EUR
        delete process.env.SIMPLEPAY_MERCHANT_KEY_EUR
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

        it('should require an https return url in production', async () => {
            setEnv()
            process.env.SIMPLEPAY_PRODUCTION = 'true'
            const fetchSpy = vi.fn()
            global.fetch = fetchSpy as unknown as typeof fetch

            try {
                delete process.env.SIMPLEPAY_REDIRECT_URL
                await expect(startPayment(paymentData)).rejects.toThrow('absolute https')

                process.env.SIMPLEPAY_REDIRECT_URL = 'http://example.com/back'
                await expect(startPayment(paymentData)).rejects.toThrow('absolute https')
                expect(fetchSpy).not.toHaveBeenCalled()
            } finally {
                delete process.env.SIMPLEPAY_PRODUCTION
                delete process.env.SIMPLEPAY_REDIRECT_URL
            }
        })

        it('should send SimplePay requests with a timeout signal', async () => {
            setEnv()
            const fetchSpy = vi.fn().mockRejectedValue(new Error('stop'))
            global.fetch = fetchSpy as unknown as typeof fetch

            await expect(startPayment(paymentData)).rejects.toThrow('stop')
            expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
        })

        it('should not trust errorCodes from an unsigned response', async () => {
            setEnv()
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('bogus') },
                text: vi.fn().mockResolvedValue(JSON.stringify({ errorCodes: ['attacker message'] }))
            }) as unknown as typeof fetch

            await expect(startPayment(paymentData)).rejects.toThrow('Invalid response signature')
        })

        it('should not log the merchant key or customer email when logging is on', async () => {
            setEnv()
            process.env.SIMPLEPAY_LOGGER = 'true'
            const log = vi.spyOn(console, 'log').mockImplementation(() => {})
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: vi.fn().mockReturnValue('mockSignature') },
                text: vi.fn().mockResolvedValue('{}')
            }) as unknown as typeof fetch

            await expect(startPayment(paymentData)).rejects.toThrow()
            const output = JSON.stringify(log.mock.calls)
            log.mockRestore()
            delete process.env.SIMPLEPAY_LOGGER

            expect(output).not.toContain('testKey')
            expect(output).not.toContain(paymentData.customerEmail)
        })
    })

    describe('getPaymentResponse', () => {
        it('should correctly decode and parse valid response', () => {
            setEnv()
            const r = 'eyJyIjowLCJ0Ijo1MDQyMzM4ODEsImUiOiJTVUNDRVNTIiwibSI6Im1lcmNoYW50RXVyb0lkIiwibyI6ImMtMS1ldXIifQ=='
            // { r: 0, t: 504233881, e: 'SUCCESS', m: 'merchantEuroId', o: 'c-1-eur' }
            const s = 'YlxrpDa8jF/xVB/rNsEJoFxOoHQ+CiziBmWSMIhYWHSCJmvLoc6kzAiZPmYDU8z6'
            const result = getPaymentResponse(r, s)
            expect(result).toEqual({
                responseCode: 0,
                transactionId: 504233881,
                event: 'SUCCESS',
                merchantId: 'merchantEuroId',
                orderRef: 'c-1-eur'
            })
        })

        it('should throw error for invalid signature', () => {
            setEnv()
            const mockResponse = {
                r: 'SUCCESS',
                t: '123456789',
                e: 'PAYMENT',
                m: 'testId',
                o: 'ORDER123'
            }
            const encodedResponse = Buffer.from(JSON.stringify(mockResponse)).toString('base64')

            expect(() =>
                getPaymentResponse(encodedResponse, 'invalid-signature')
            ).toThrow('Invalid response signature')
        })

        it('should reject a redirect signed with an empty key when the merchant key is missing', () => {
            setEnv()
            process.env.SIMPLEPAY_MERCHANT_ID_USD = 'merchantUsdId'
            const body = JSON.stringify({ r: 0, t: 1, e: 'SUCCESS', m: 'merchantUsdId', o: 'forged' })
            const forged = crypto.createHmac('sha384', '').update(body, 'utf8').digest('base64')
            const r = Buffer.from(body).toString('base64')

            try {
                expect(() => getPaymentResponse(r, forged)).toThrow('Missing SimplePay configuration for USD')
            } finally {
                delete process.env.SIMPLEPAY_MERCHANT_ID_USD
            }
        })
    })
})
