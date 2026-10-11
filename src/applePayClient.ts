export type ApplePayButtonStyle = 'black' | 'white' | 'white-outline'

export type ApplePayButtonType = 'plain' | 'buy' | 'pay' | 'check-out' | 'book' | 'donate' | 'subscribe'

export type ApplePayNetwork = 'visa' | 'masterCard' | 'amex' | 'discover'

export interface ApplePayButtonConfig {
    container: HTMLElement | string
    merchantIdentifier: string
    merchantName: string
    validationEndpoint: string
    authorizationEndpoint: string
    currency: string
    total: string
    orderRef: string
    countryCode?: string
    locale?: string
    buttonStyle?: ApplePayButtonStyle
    buttonType?: ApplePayButtonType
    supportedNetworks?: ApplePayNetwork[]
    onResult?: (response: unknown) => void
    onError?: (error: unknown) => void
}

const APPLE_PAY_SCRIPT_URL = 'https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js'
const APPLE_PAY_VERSION = 3
const MAX_TOKEN_JSON_LENGTH = 65_536
const DEFAULT_NETWORKS: ApplePayNetwork[] = ['visa', 'masterCard', 'amex', 'discover']

interface ApplePayPaymentRequest {
    countryCode: string
    currencyCode: string
    merchantCapabilities: Array<'supports3DS'>
    supportedNetworks: ApplePayNetwork[]
    total: {
        label: string
        type: 'final'
        amount: string
    }
}

interface ApplePaySessionInstance {
    begin: () => void
    abort: () => void
    completeMerchantValidation: (merchantSession: unknown) => void
    completePayment: (result: { status: number }) => void
    onvalidatemerchant: ((event: unknown) => void) | null
    onpaymentauthorized: ((event: { payment?: { token?: unknown } }) => void) | null
}

interface ApplePaySessionConstructor {
    new (version: number, request: ApplePayPaymentRequest): ApplePaySessionInstance
    STATUS_SUCCESS: number
    STATUS_FAILURE: number
    canMakePayments: () => boolean
    applePayCapabilities?: (merchantIdentifier: string) => Promise<{ paymentCredentialStatus?: string }>
}

declare global {
    interface Window {
        ApplePaySession?: ApplePaySessionConstructor
    }
}

const isPositiveAmount = (total: string) => {
    if (!/^\d+(\.\d{1,2})?$/.test(total)) {
        return false
    }

    return Number(total) > 0
}

const isSafeEndpoint = (url: string) => {
    if (url.length === 0 || url.startsWith('//') || url.includes('\\') || url.includes(' ')) {
        return false
    }

    if (url.startsWith('/')) {
        return true
    }

    try {
        const protocol = new URL(url).protocol
        return protocol === 'https:' || protocol === 'http:'
    } catch {
        return false
    }
}

const isMerchantSession = (value: unknown): value is { merchantSessionIdentifier: string } => {
    if (!value || typeof value !== 'object') {
        return false
    }

    const session = value as { merchantSessionIdentifier?: unknown }
    return typeof session.merchantSessionIdentifier === 'string' && session.merchantSessionIdentifier.length > 0
}

const readTransactionId = (value: unknown) => {
    const id = typeof value === 'number' ? value : Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error('Invalid Apple Pay transaction id')
    }

    return id
}

const isSuccessfulCharge = (value: unknown) => {
    if (!value || typeof value !== 'object') {
        return false
    }

    const body = value as { applePayStatus?: unknown, errorCodes?: unknown }
    if (body.applePayStatus !== 'STATUS_SUCCESS') {
        return false
    }

    return !Array.isArray(body.errorCodes) || body.errorCodes.length === 0
}

const encodeJsonBase64 = (value: object) => {
    const json = JSON.stringify(value)
    if (json.length > MAX_TOKEN_JSON_LENGTH) {
        throw new Error('Apple Pay token is too large')
    }

    const bytes = new TextEncoder().encode(json)
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }

    return btoa(binary)
}

const reportError = (config: ApplePayButtonConfig, error: unknown) => {
    if (!config.onError) {
        throw error
    }

    config.onError(error)
}

const loadApplePayScript = () => new Promise<void>((resolve, reject) => {
    if (window.customElements?.get('apple-pay-button')) {
        resolve()
        return
    }

    const fail = () => reject(new Error('Failed to load Apple Pay'))
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_PAY_SCRIPT_URL}"]`)
    if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', fail, { once: true })
        return
    }

    const script = document.createElement('script')
    script.src = APPLE_PAY_SCRIPT_URL
    script.async = true
    script.crossOrigin = 'anonymous'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', fail, { once: true })
    document.head.appendChild(script)
})

const canShowApplePay = async (merchantIdentifier: string) => {
    if (typeof window === 'undefined' || !window.ApplePaySession) {
        return false
    }

    const ApplePaySession = window.ApplePaySession

    if (typeof ApplePaySession.applePayCapabilities !== 'function') {
        return ApplePaySession.canMakePayments()
    }

    const capabilities = await ApplePaySession.applePayCapabilities(merchantIdentifier)
    return capabilities.paymentCredentialStatus !== 'applePayUnsupported'
}

const resolveContainer = (container: HTMLElement | string) => {
    if (typeof container !== 'string') {
        return container
    }

    const element = document.querySelector(container)
    if (!element) {
        throw new Error(`Apple Pay container not found: ${container}`)
    }

    return element
}

const postJson = async (url: string, body: object) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error(`Apple Pay request failed: ${response.status}`)
    }

    return response.json() as Promise<unknown>
}

const buildPaymentRequest = (config: ApplePayButtonConfig): ApplePayPaymentRequest => ({
    countryCode: config.countryCode || 'HU',
    currencyCode: config.currency,
    merchantCapabilities: ['supports3DS'],
    supportedNetworks: config.supportedNetworks?.length ? config.supportedNetworks : DEFAULT_NETWORKS,
    total: {
        label: config.merchantName,
        type: 'final',
        amount: config.total,
    },
})

const startApplePaySession = (config: ApplePayButtonConfig) => {
    const ApplePaySession = window.ApplePaySession
    if (!ApplePaySession) {
        throw new Error('Apple Pay is unavailable')
    }

    const domain = window.location.hostname
    if (!domain) {
        throw new Error('Missing Apple Pay domain')
    }

    const session = new ApplePaySession(APPLE_PAY_VERSION, buildPaymentRequest(config))
    let transactionId = 0
    let settled = false

    const settle = (status: number) => {
        if (settled) {
            return
        }

        settled = true
        try {
            session.completePayment({ status })
        } catch (error) {
            session.abort()
            throw error
        }
    }

    session.onvalidatemerchant = async () => {
        try {
            const body = await postJson(config.validationEndpoint, {
                orderRef: config.orderRef,
                domain,
            })
            if (!body || typeof body !== 'object') {
                throw new Error('Missing Apple Pay session')
            }

            const response = body as { transactionId?: unknown, applePaySession?: unknown }
            if (!isMerchantSession(response.applePaySession)) {
                throw new Error('Missing Apple Pay session')
            }

            transactionId = readTransactionId(response.transactionId)
            session.completeMerchantValidation(response.applePaySession)
        } catch (error) {
            session.abort()
            reportError(config, error)
        }
    }

    session.onpaymentauthorized = async (event) => {
        try {
            const token = event.payment?.token
            if (!token || typeof token !== 'object') {
                throw new Error('Missing Apple Pay token')
            }

            if (!transactionId) {
                throw new Error('Invalid Apple Pay transaction id')
            }

            const body = await postJson(config.authorizationEndpoint, {
                orderRef: config.orderRef,
                transactionId,
                applePayToken: encodeJsonBase64(token),
            })

            if (!isSuccessfulCharge(body)) {
                settle(ApplePaySession.STATUS_FAILURE)
                throw new Error('Apple Pay authorization failed')
            }

            settle(ApplePaySession.STATUS_SUCCESS)
            config.onResult?.(body)
        } catch (error) {
            try {
                settle(ApplePaySession.STATUS_FAILURE)
            } catch {
                session.abort()
            }
            reportError(config, error)
        }
    }

    session.begin()
}

const renderApplePayButton = async (config: ApplePayButtonConfig) => {
    if (!isSafeEndpoint(config.validationEndpoint) || !isSafeEndpoint(config.authorizationEndpoint)) {
        throw new Error('Missing Apple Pay endpoint')
    }

    if (!config.orderRef) {
        throw new Error('Missing Apple Pay order reference')
    }

    if (!config.merchantIdentifier) {
        throw new Error('Missing Apple Pay merchant identifier')
    }

    if (!config.merchantName) {
        throw new Error('Missing Apple Pay merchant name')
    }

    if (!isPositiveAmount(config.total)) {
        throw new Error('Invalid Apple Pay total')
    }

    if (!/^[A-Z]{3}$/.test(config.currency)) {
        throw new Error('Invalid Apple Pay currency')
    }

    const available = await canShowApplePay(config.merchantIdentifier)
    if (!available) {
        return
    }

    await loadApplePayScript()

    const container = resolveContainer(config.container)
    const button = document.createElement('apple-pay-button')
    button.setAttribute('buttonstyle', config.buttonStyle || 'black')
    button.setAttribute('type', config.buttonType || 'plain')
    button.setAttribute('locale', config.locale || 'hu-HU')
    button.addEventListener('click', () => {
        try {
            startApplePaySession(config)
        } catch (error) {
            reportError(config, error)
        }
    })
    container.appendChild(button)
}

export { renderApplePayButton }
