export type GooglePayEnvironment = 'TEST' | 'PRODUCTION'

export type GooglePayCardNetwork = 'VISA' | 'MASTERCARD' | 'AMEX'

export interface GooglePayButtonConfig {
    container: HTMLElement | string
    merchantId: string
    merchantName: string
    environment: GooglePayEnvironment
    gatewayMerchantId: string
    authorizationEndpoint: string
    currency: string
    total: string
    orderRef: string
    countryCode?: string
    allowedCardNetworks?: GooglePayCardNetwork[]
    onResult?: (response: unknown) => void
    onError?: (error: unknown) => void
}

const GOOGLE_PAY_SCRIPT_URL = 'https://pay.google.com/gp/p/js/pay.js'
const THREE_DS_CHALLENGE_CODE = '3004'
const DEFAULT_CARD_NETWORKS: GooglePayCardNetwork[] = ['VISA', 'MASTERCARD', 'AMEX']

interface GooglePayRequest {
    apiVersion: 2
    apiVersionMinor: 0
    allowedPaymentMethods: Array<{
        type: 'CARD'
        parameters: {
            allowedAuthMethods: Array<'PAN_ONLY' | 'CRYPTOGRAM_3DS'>
            allowedCardNetworks: GooglePayCardNetwork[]
        }
        tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY'
            parameters: {
                gateway: 'simplepay'
                gatewayMerchantId: string
            }
        }
    }>
    merchantInfo: {
        merchantId: string
        merchantName: string
    }
    transactionInfo?: {
        countryCode: string
        currencyCode: string
        totalPriceStatus: 'FINAL'
        totalPrice: string
    }
}

interface GooglePayPaymentDataResult {
    paymentMethodData?: {
        tokenizationData?: {
            token?: string
        }
    }
}

interface GooglePaymentsClient {
    isReadyToPay: (request: GooglePayRequest) => Promise<{ result?: boolean }>
    createButton: (options: { onClick: () => Promise<void> }) => Node
    loadPaymentData: (request: GooglePayRequest) => Promise<GooglePayPaymentDataResult>
}

interface GooglePaymentsClientConstructor {
    new (options: { environment: GooglePayEnvironment }): GooglePaymentsClient
}

declare global {
    interface Window {
        google?: {
            payments?: {
                api?: {
                    PaymentsClient?: GooglePaymentsClientConstructor
                }
            }
        }
    }
}

const isHttpUrl = (url: string) => {
    try {
        const protocol = new URL(url).protocol
        return protocol === 'https:' || protocol === 'http:'
    } catch {
        return false
    }
}

const isThreeDsRedirect = (response: unknown): response is { redirectUrl: string, errorCodes: unknown[] } => {
    if (!response || typeof response !== 'object') {
        return false
    }

    const body = response as { redirectUrl?: unknown, errorCodes?: unknown }
    if (typeof body.redirectUrl !== 'string' || body.redirectUrl.length === 0) {
        return false
    }

    if (!Array.isArray(body.errorCodes)) {
        return false
    }

    return body.errorCodes.some((code) => String(code) === THREE_DS_CHALLENGE_CODE)
}

const buildGooglePayRequest = (config: GooglePayButtonConfig, includeTransaction: boolean): GooglePayRequest => {
    const request: GooglePayRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [
            {
                type: 'CARD',
                parameters: {
                    allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                    allowedCardNetworks: config.allowedCardNetworks?.length
                        ? config.allowedCardNetworks
                        : DEFAULT_CARD_NETWORKS,
                },
                tokenizationSpecification: {
                    type: 'PAYMENT_GATEWAY',
                    parameters: {
                        gateway: 'simplepay',
                        gatewayMerchantId: config.gatewayMerchantId,
                    },
                },
            },
        ],
        merchantInfo: {
            merchantId: config.merchantId,
            merchantName: config.merchantName,
        },
    }

    if (!includeTransaction) {
        return request
    }

    return {
        ...request,
        transactionInfo: {
            countryCode: config.countryCode || 'HU',
            currencyCode: config.currency,
            totalPriceStatus: 'FINAL',
            totalPrice: config.total,
        },
    }
}

const loadGooglePayScript = () => new Promise<void>((resolve, reject) => {
    if (window.google?.payments?.api?.PaymentsClient) {
        resolve()
        return
    }

    const fail = () => reject(new Error('Failed to load Google Pay'))
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_PAY_SCRIPT_URL}"]`)
    if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', fail, { once: true })
        return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_PAY_SCRIPT_URL
    script.async = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', fail, { once: true })
    document.head.appendChild(script)
})

const getPaymentsClient = (environment: GooglePayEnvironment) => {
    const PaymentsClient = window.google?.payments?.api?.PaymentsClient
    if (!PaymentsClient) {
        throw new Error('Google Pay is unavailable')
    }

    return new PaymentsClient({ environment })
}

const resolveContainer = (container: HTMLElement | string) => {
    if (typeof container !== 'string') {
        return container
    }

    const element = document.querySelector(container)
    if (!element) {
        throw new Error(`Google Pay container not found: ${container}`)
    }

    return element
}

const authorizeGooglePay = async (config: GooglePayButtonConfig, token: string) => {
    const response = await fetch(config.authorizationEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            googlePayToken: btoa(token),
            orderRef: config.orderRef,
        }),
    })

    if (!response.ok) {
        throw new Error(`Google Pay authorization failed: ${response.status}`)
    }

    return response.json() as Promise<unknown>
}

const handleAuthorizationResult = (config: GooglePayButtonConfig, body: unknown) => {
    if (!isThreeDsRedirect(body)) {
        config.onResult?.(body)
        return
    }

    if (!isHttpUrl(body.redirectUrl)) {
        throw new Error('Invalid Google Pay redirect url')
    }

    window.location.replace(body.redirectUrl)
}

const onGooglePaymentButtonClicked = async (client: GooglePaymentsClient, config: GooglePayButtonConfig) => {
    try {
        const paymentData = await client.loadPaymentData(buildGooglePayRequest(config, true))
        const token = paymentData.paymentMethodData?.tokenizationData?.token
        if (!token) {
            throw new Error('Missing Google Pay token')
        }

        const body = await authorizeGooglePay(config, token)
        handleAuthorizationResult(config, body)
    } catch (error) {
        if (!config.onError) {
            throw error
        }

        config.onError(error)
    }
}

const renderGooglePayButton = async (config: GooglePayButtonConfig) => {
    if (!config.authorizationEndpoint) {
        throw new Error('Missing Google Pay authorization endpoint')
    }

    if (!config.orderRef) {
        throw new Error('Missing Google Pay order reference')
    }

    if (!config.merchantId || !config.gatewayMerchantId) {
        throw new Error('Missing Google Pay merchant id')
    }

    if (!config.merchantName) {
        throw new Error('Missing Google Pay merchant name')
    }

    await loadGooglePayScript()

    const client = getPaymentsClient(config.environment)
    const ready = await client.isReadyToPay(buildGooglePayRequest(config, false))
    if (!ready.result) {
        return
    }

    const container = resolveContainer(config.container)
    const button = client.createButton({
        onClick: () => onGooglePaymentButtonClicked(client, config),
    })
    container.appendChild(button)
}

export { renderGooglePayButton }
