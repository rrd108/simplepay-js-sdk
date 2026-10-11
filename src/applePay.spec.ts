import { describe, it, expect, vi, beforeEach } from 'vitest'
import { doApplePay, startApplePay } from './index'
import { generateSignature } from './utils'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP = 'testIdSzep'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP = 'testKeySzep'
}

const applePayToken = btoa('{"paymentData":{"data":"token"}}')

const startData = {
    orderRef: 'TEST123',
    customerEmail: 'test@example.com',
    total: 1212,
    domain: 'shop.example.com',
    invoice: {
        name: 'Customer Name',
        country: 'HU',
        state: 'Budapest',
        city: 'Budapest',
        zip: '1234',
        address: 'Street 1',
    },
}

const merchantSession = {
    epochTimestamp: 1749017418352,
    expiresAt: 1749021018352,
    merchantSessionIdentifier: 'SSHCE5A2091BEC546FD8FACC2A313A2E8AF',
    nonce: '836a2281',
    merchantIdentifier: 'APPLEMERCHANT',
    domainName: 'shop.example.com',
    displayName: 'Shop Name',
    signature: '308008',
    retries: 0,
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

describe('startApplePay', () => {
    beforeEach(() => {
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP
        delete process.env.SIMPLEPAY_PRODUCTION
    })

    it('should throw error when merchant configuration is missing', async () => {
        await expect(startApplePay(startData)).rejects.toThrow('Missing SimplePay configuration')
    })

    it('should throw error when the domain is not a registered FQDN', async () => {
        setEnv()
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(startApplePay({
            ...startData,
            domain: 'https://shop.example.com/pay',
        })).rejects.toThrow('registered FQDN')
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    it('should throw error for HUF_SZEP', async () => {
        setEnv()
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(startApplePay({
            ...startData,
            currency: 'HUF_SZEP',
        })).rejects.toThrow('Apple Pay does not support HUF_SZEP')
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    it('should post a startapplepay request with the registered domain', async () => {
        setEnv()
        mockFetch({
            merchant: 'testId',
            transactionId: 581841992,
            applePaySession: merchantSession,
        })

        await expect(startApplePay(startData)).resolves.toMatchObject({
            transactionId: 581841992,
            applePaySession: merchantSession,
        })

        const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(url).toBe('https://sandbox.simplepay.hu/payment/v2/startapplepay')
        expect(init.headers.Signature).toBe(generateSignature(init.body, 'testKey'))

        const body = JSON.parse(init.body)
        expect(body.domain).toBe('shop.example.com')
        expect(body.merchant).toBe('testId')
        expect(body.total).toBe('1212')
        expect(body.currency).toBe('HUF')
        expect(body.orderRef).toBe('TEST123')
        expect(body.customerEmail).toBe('test@example.com')
        expect(body.language).toBe('HU')
        expect(body.invoice.name).toBe('Customer Name')
        expect(body.url).toBeUndefined()
        expect(body.methods).toBeUndefined()
        expect(body.applePayToken).toBeUndefined()
    })

    it('should throw error for an invalid response signature', async () => {
        setEnv()
        mockFetch({
            merchant: 'testId',
            transactionId: 581841992,
            applePaySession: merchantSession,
        }, 'invalid-signature')

        await expect(startApplePay(startData)).rejects.toThrow('Invalid response signature')
    })

    it('should throw error when SimplePay returns error codes', async () => {
        setEnv()
        mockFetch({
            errorCodes: [5373],
            merchant: 'testId',
            transactionId: 1,
        })

        await expect(startApplePay(startData)).rejects.toThrow('SimplePay API error: 5373')
    })

    it('should throw error when the merchant session is missing', async () => {
        setEnv()
        mockFetch({
            merchant: 'testId',
            transactionId: 581841992,
        })

        await expect(startApplePay(startData)).rejects.toThrow('Missing Apple Pay session')
    })
})

describe('doApplePay', () => {
    beforeEach(() => {
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF_SZEP
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF_SZEP
    })

    it('should throw error when the token is not base64', async () => {
        setEnv()
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(doApplePay({
            transactionId: 581841992,
            applePayToken: '{"paymentData":{}}',
        })).rejects.toThrow('Missing Apple Pay token')
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    it('should throw error for an invalid transaction id', async () => {
        setEnv()
        await expect(doApplePay({
            transactionId: 0,
            applePayToken,
        })).rejects.toThrow('Invalid Apple Pay transaction id')
    })

    it('should post a doapplepay request with the given token', async () => {
        setEnv()
        mockFetch({
            merchant: 'testId',
            orderRef: 'TEST123',
            transactionId: 581841992,
            currency: 'HUF',
            total: 1212,
            applePayStatus: 'STATUS_SUCCESS',
        })

        await expect(doApplePay({
            transactionId: '581841992',
            applePayToken,
            currency: 'HUF',
        })).resolves.toMatchObject({
            applePayStatus: 'STATUS_SUCCESS',
            orderRef: 'TEST123',
        })

        const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(url).toBe('https://sandbox.simplepay.hu/payment/v2/doapplepay')
        expect(init.headers.Signature).toBe(generateSignature(init.body, 'testKey'))

        const body = JSON.parse(init.body)
        expect(body.transactionId).toBe(581841992)
        expect(body.applePayToken).toBe(applePayToken)
        expect(body.currency).toBe('HUF')
        expect(body.merchant).toBe('testId')
        expect(body.orderRef).toBeUndefined()
        expect(body.total).toBeUndefined()
    })

    it('should throw error when the payment is not successful', async () => {
        setEnv()
        mockFetch({
            merchant: 'testId',
            transactionId: 581841992,
            currency: 'HUF',
            applePayStatus: 'STATUS_FAILURE',
        })

        await expect(doApplePay({
            transactionId: 581841992,
            applePayToken,
        })).rejects.toThrow('Apple Pay authorization failed')
    })
})
