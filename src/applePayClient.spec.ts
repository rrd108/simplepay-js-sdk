import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApplePayButton } from './applePayClient'

const applePayCapabilities = vi.fn()
const begin = vi.fn()
const abort = vi.fn()
const completeMerchantValidation = vi.fn()
const completePayment = vi.fn()
const sessions: ApplePaySession[] = []

class ApplePaySession {
    static STATUS_SUCCESS = 0
    static STATUS_FAILURE = 1
    static applePayCapabilities = applePayCapabilities
    static canMakePayments = () => true
    onvalidatemerchant: ((event: unknown) => Promise<void>) | null = null
    onpaymentauthorized: ((event: { payment?: { token?: unknown } }) => Promise<void>) | null = null

    constructor() {
        sessions.push(this)
    }

    begin() {
        begin()
    }

    abort() {
        abort()
    }

    completeMerchantValidation(merchantSession: unknown) {
        completeMerchantValidation(merchantSession)
    }

    completePayment(result: { status: number }) {
        completePayment(result)
    }
}

const buttonConfig = {
    merchantIdentifier: 'APPLE_MERCHANT',
    merchantName: 'Shop Name',
    validationEndpoint: '/api/apple-pay/validate',
    authorizationEndpoint: '/api/apple-pay/authorize',
    currency: 'HUF',
    total: '1212',
    orderRef: 'order-12',
}

const merchantSession = {
    merchantSessionIdentifier: 'SSHCE5A2091BEC546FD8FACC2A313A2E8AF',
    domainName: 'shop.example.com',
}

describe('renderApplePayButton', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        applePayCapabilities.mockReset()
        begin.mockReset()
        abort.mockReset()
        completeMerchantValidation.mockReset()
        completePayment.mockReset()
        sessions.length = 0
    })

    const installApplePay = () => {
        const button = {
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
        }
        vi.stubGlobal('window', {
            location: { hostname: 'shop.example.com' },
            ApplePaySession,
        })
        vi.stubGlobal('fetch', vi.fn())
        vi.stubGlobal('document', {
            querySelector: vi.fn().mockReturnValue(null),
            createElement: vi.fn((tag: string) => {
                if (tag === 'script') {
                    return {
                        addEventListener: (event: string, handler: () => void) => {
                            if (event === 'load') {
                                handler()
                            }
                        },
                    }
                }

                return button
            }),
            head: { appendChild: vi.fn() },
        })
        return button
    }

    const click = (button: { addEventListener: ReturnType<typeof vi.fn> }) => {
        const handler = button.addEventListener.mock.calls.find(([event]) => event === 'click')?.[1] as () => void
        handler()
        return sessions[0]
    }

    it('should skip the button when Apple Pay is unsupported', async () => {
        const button = installApplePay()
        applePayCapabilities.mockResolvedValue({ paymentCredentialStatus: 'applePayUnsupported' })
        const container = { appendChild: vi.fn() }

        await renderApplePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
        })

        expect(container.appendChild).not.toHaveBeenCalled()
        expect(button.addEventListener).not.toHaveBeenCalled()
    })

    it('should validate the merchant and authorize the base64 payment token', async () => {
        const button = installApplePay()
        applePayCapabilities.mockResolvedValue({ paymentCredentialStatus: 'paymentCredentialsAvailable' })
        const token = { paymentData: { data: 'apple-pay-token' }, transactionIdentifier: 'tx-1' }
        const onResult = vi.fn()
        const charge = { applePayStatus: 'STATUS_SUCCESS', transactionId: 581841992, orderRef: 'order-12' }
        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    transactionId: 581841992,
                    applePaySession: merchantSession,
                }),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue(charge),
            } as unknown as Response)
        const container = { appendChild: vi.fn() }

        await renderApplePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
            onResult,
        })

        expect(container.appendChild).toHaveBeenCalledOnce()
        const active = click(button)
        expect(begin).toHaveBeenCalledOnce()

        await active.onvalidatemerchant?.({})
        expect(fetch).toHaveBeenCalledWith('/api/apple-pay/validate', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                orderRef: 'order-12',
                domain: 'shop.example.com',
            }),
        }))
        expect(completeMerchantValidation).toHaveBeenCalledWith(merchantSession)

        await active.onpaymentauthorized?.({ payment: { token } })
        expect(fetch).toHaveBeenCalledWith('/api/apple-pay/authorize', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                orderRef: 'order-12',
                transactionId: 581841992,
                applePayToken: btoa(JSON.stringify(token)),
            }),
        }))
        expect(completePayment).toHaveBeenCalledWith({ status: ApplePaySession.STATUS_SUCCESS })
        expect(onResult).toHaveBeenCalledWith(charge)
        expect(abort).not.toHaveBeenCalled()
    })

    it('should close the sheet when authorization fails', async () => {
        const button = installApplePay()
        applePayCapabilities.mockResolvedValue({ paymentCredentialStatus: 'paymentCredentialsAvailable' })
        const onResult = vi.fn()
        const onError = vi.fn()
        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    transactionId: 581841992,
                    applePaySession: merchantSession,
                }),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    applePayStatus: 'STATUS_FAILURE',
                    errorCodes: [5373],
                }),
            } as unknown as Response)
        const container = { appendChild: vi.fn() }

        await renderApplePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
            onResult,
            onError,
        })

        const active = click(button)
        await active.onvalidatemerchant?.({})
        await active.onpaymentauthorized?.({
            payment: { token: { paymentData: { data: 'apple-pay-token' } } },
        })

        expect(completePayment).toHaveBeenCalledWith({ status: ApplePaySession.STATUS_FAILURE })
        expect(onResult).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledOnce()
    })
})
