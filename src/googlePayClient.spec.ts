import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderGooglePayButton } from './googlePayClient'

const replace = vi.fn()
const isReadyToPay = vi.fn()
const loadPaymentData = vi.fn()
const createButton = vi.fn(({ onClick }: { onClick: () => Promise<void> }) => ({
    click: () => onClick(),
}))

class PaymentsClient {
    constructor(_options: { environment: string }) {}
    isReadyToPay = isReadyToPay
    loadPaymentData = loadPaymentData
    createButton = createButton
}

const buttonConfig = {
    merchantId: 'GOOGLE_MERCHANT',
    merchantName: 'Shop Name',
    environment: 'TEST' as const,
    gatewayMerchantId: 'SIMPLEPAY_MERCHANT',
    authorizationEndpoint: '/api/google-pay',
    currency: 'HUF',
    total: '1212',
    orderRef: 'order-12',
}

describe('renderGooglePayButton', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        replace.mockReset()
        isReadyToPay.mockReset()
        loadPaymentData.mockReset()
        createButton.mockClear()
    })

    const installGooglePay = () => {
        vi.stubGlobal('window', {
            location: { replace },
            google: {
                payments: {
                    api: {
                        PaymentsClient,
                    },
                },
            },
        })
        vi.stubGlobal('fetch', vi.fn())
    }

    it('should skip the button when Google Pay is not ready', async () => {
        installGooglePay()
        isReadyToPay.mockResolvedValue({ result: false })
        const container = { appendChild: vi.fn() }

        await renderGooglePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
        })

        expect(container.appendChild).not.toHaveBeenCalled()
    })

    it('should render the button and post the base64 token with the order reference', async () => {
        installGooglePay()
        isReadyToPay.mockResolvedValue({ result: true })
        loadPaymentData.mockResolvedValue({
            paymentMethodData: {
                tokenizationData: {
                    token: 'google-pay-token',
                },
            },
        })
        const onResult = vi.fn()
        const result = { transactionId: '123456', orderRef: 'order-12' }
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(result),
        } as unknown as Response)
        const container = { appendChild: vi.fn() }

        await renderGooglePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
            onResult,
        })

        expect(isReadyToPay).toHaveBeenCalledWith(expect.objectContaining({
            allowedPaymentMethods: [
                expect.objectContaining({
                    parameters: {
                        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                        allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX'],
                    },
                    tokenizationSpecification: {
                        type: 'PAYMENT_GATEWAY',
                        parameters: {
                            gateway: 'simplepay',
                            gatewayMerchantId: 'SIMPLEPAY_MERCHANT',
                        },
                    },
                }),
            ],
        }))
        expect(container.appendChild).toHaveBeenCalledOnce()

        const button = container.appendChild.mock.calls[0][0] as { click: () => Promise<void> }
        await button.click()

        expect(loadPaymentData).toHaveBeenCalledWith(expect.objectContaining({
            transactionInfo: {
                countryCode: 'HU',
                currencyCode: 'HUF',
                totalPriceStatus: 'FINAL',
                totalPrice: '1212',
            },
        }))
        expect(fetch).toHaveBeenCalledWith('/api/google-pay', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                googlePayToken: btoa('google-pay-token'),
                orderRef: 'order-12',
            }),
        }))
        expect(onResult).toHaveBeenCalledWith(result)
        expect(replace).not.toHaveBeenCalled()
    })

    it('should navigate when the authorization response requires a 3DS challenge', async () => {
        installGooglePay()
        isReadyToPay.mockResolvedValue({ result: true })
        loadPaymentData.mockResolvedValue({
            paymentMethodData: {
                tokenizationData: {
                    token: 'google-pay-token',
                },
            },
        })
        const onResult = vi.fn()
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                errorCodes: [3004],
                redirectUrl: 'https://sb-checkout.simplepay.hu/pay/challenge',
            }),
        } as unknown as Response)
        const container = { appendChild: vi.fn() }

        await renderGooglePayButton({
            ...buttonConfig,
            container: container as unknown as HTMLElement,
            onResult,
        })

        const button = container.appendChild.mock.calls[0][0] as { click: () => Promise<void> }
        await button.click()

        expect(replace).toHaveBeenCalledWith('https://sb-checkout.simplepay.hu/pay/challenge')
        expect(onResult).not.toHaveBeenCalled()
    })
})
