import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPaymentResponse, startPayment } from './index'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
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
    })
})
