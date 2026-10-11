import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startGooglePay } from './index'
import { generateSignature } from './utils'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP = 'testIdSzep'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP = 'testKeySzep'
}

const paymentData = {
    orderRef: 'TEST123',
    customerEmail: 'test@example.com',
    total: 1212,
    googlePayToken: 'Z29vZ2xlLXBheS10b2tlbg==',
    invoice: {
        name: 'Customer Name',
        country: 'HU',
        state: 'Budapest',
        city: 'Budapest',
        zip: '1234',
        address: 'Street 1',
    },
}

const mockFetch = (body: object, signature?: string, ok = true) => {
    const responseText = JSON.stringify(body)
    global.fetch = vi.fn().mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        headers: {
            get: vi.fn().mockReturnValue(signature ?? generateSignature(responseText, 'testKey')),
        },
        text: vi.fn().mockResolvedValue(responseText),
    }) as unknown as typeof fetch
}

describe('startGooglePay', () => {
    beforeEach(() => {
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP
        delete process.env.SIMPLEPAY_PRODUCTION
        delete process.env.SIMPLEPAY_REDIRECT_URL
    })

    it('should throw error when merchant configuration is missing', async () => {
        await expect(startGooglePay(paymentData)).rejects.toThrow('Missing SimplePay configuration')
    })

    it('should throw error when the Google Pay token is missing', async () => {
        setEnv()
        await expect(startGooglePay({
            ...paymentData,
            googlePayToken: '',
        })).rejects.toThrow('Missing Google Pay token')
    })

    it('should throw error for HUF_SZEP', async () => {
        setEnv()
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(startGooglePay({
            ...paymentData,
            currency: 'HUF_SZEP',
        })).rejects.toThrow('Google Pay does not support HUF_SZEP')
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    it('should throw error when the production return url is not absolute https', async () => {
        setEnv()
        process.env.SIMPLEPAY_PRODUCTION = 'true'
        process.env.SIMPLEPAY_REDIRECT_URL = 'http://example.com/callback'
        await expect(startGooglePay(paymentData)).rejects.toThrow('absolute https')
    })

    it('should post a CIT doGooglePay request with the given token', async () => {
        setEnv()
        mockFetch({
            transactionId: '123456',
            total: '1212',
            merchant: 'testId',
            orderRef: 'TEST123',
            currency: 'HUF',
        })

        await expect(startGooglePay(paymentData)).resolves.toMatchObject({
            transactionId: '123456',
            orderRef: 'TEST123',
        })

        const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(url).toBe('https://sandbox.simplepay.hu/payment/v2/doGooglePay')
        expect(init.headers.Signature).toBe(generateSignature(init.body, 'testKey'))

        const body = JSON.parse(init.body)
        expect(body.type).toBe('CIT')
        expect(body.googlePayToken).toBe(paymentData.googlePayToken)
        expect(body.merchant).toBe('testId')
        expect(body.total).toBe('1212')
        expect(body.currency).toBe('HUF')
        expect(body.orderRef).toBe('TEST123')
        expect(body.customerEmail).toBe('test@example.com')
        expect(body.invoice.name).toBe('Customer Name')
    })

    it('should throw error for an invalid response signature', async () => {
        setEnv()
        mockFetch({
            transactionId: '123456',
            merchant: 'testId',
            orderRef: 'TEST123',
            currency: 'HUF',
            total: '1212',
        }, 'invalid-signature')

        await expect(startGooglePay(paymentData)).rejects.toThrow('Invalid response signature')
    })

    it('should return the 3DS redirect when error code 3004 includes redirectUrl', async () => {
        setEnv()
        const challenge = {
            errorCodes: [3004],
            merchant: 'testId',
            orderRef: 'TEST123',
            currency: 'HUF',
            total: 1212,
            transactionId: 10312754,
            redirectUrl: 'https://sb-checkout.simplepay.hu/pay/challenge',
        }
        mockFetch(challenge)

        await expect(startGooglePay(paymentData)).resolves.toMatchObject({
            redirectUrl: challenge.redirectUrl,
            errorCodes: [3004],
        })
    })

    it('should throw error for error codes other than the 3DS challenge', async () => {
        setEnv()
        mockFetch({
            errorCodes: [5010],
            merchant: 'testId',
            orderRef: 'TEST123',
            currency: 'HUF',
            total: '1212',
            transactionId: '1',
        })

        await expect(startGooglePay(paymentData)).rejects.toThrow('SimplePay API error: 5010')
    })

    it('should throw error when error code 3004 has no redirect url', async () => {
        setEnv()
        mockFetch({
            errorCodes: [3004],
            merchant: 'testId',
            orderRef: 'TEST123',
            currency: 'HUF',
            total: '1212',
            transactionId: '1',
        })

        await expect(startGooglePay(paymentData)).rejects.toThrow('SimplePay API error: 3004')
    })
})
