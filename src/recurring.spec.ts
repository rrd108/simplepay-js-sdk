import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startRecurringPayment } from './recurring'
import { toISO8601DateString } from './utils'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_EUR = 'merchantEuroId'
    process.env.SIMPLEPAY_MERCHANT_KEY_EUR = 'secretEuroKey'
}

const paymentData = {
    orderRef: 'TEST123',
    customer: 'Radharadhya Dasa',
    customerEmail: 'test@example.com',
    total: 1212,
    recurring: {
        times: 3,
        until: toISO8601DateString(new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)),
        maxAmount: 12000
    }
}
describe('SimplePay Recurring Tests', () => {
    beforeEach(() => {
        // Clear all environment variables before each test
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_EUR
        delete process.env.SIMPLEPAY_MERCHANT_KEY_EUR
    })

    describe('startRecurringPayment', () => {
        it('should throw error when merchant configuration is missing', async () => {
            await expect(startRecurringPayment(paymentData)).rejects.toThrow('Missing SimplePay configuration')
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
            await expect(startRecurringPayment(paymentData)).rejects.toThrow('Invalid response signature')
        })

        it('should successfully start recurring payment and card registration when API returns valid response', async () => {
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

            await expect(startRecurringPayment(paymentData)).resolves.toBeDefined()
        })
    })

})
