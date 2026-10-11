export type PaymentMethod = 'CARD' | 'WIRE'

export const CURRENCIES = ['HUF', 'HUF_SZEP', 'EUR', 'USD'] as const
export type Currency = typeof CURRENCIES[number]

export const LANGUAGES = [
    'AR', // Arabic
    'BG', // Bulgarian
    'CS', // Czech
    'DE', // German
    'EN', // English
    'ES', // Spanish
    'FR', // French
    'IT', // Italian
    'HR', // Croatian
    'HU', // Hungarian
    'PL', // Polish
    'RO', // Romanian
    'RU', // Russian
    'SK', // Slovak
    'TR', // Turkish
    'ZH', // Chinese
] as const
export type Language = typeof LANGUAGES[number]

export interface PaymentData {
    orderRef: string
    total: number | string
    customerEmail: string
    currency?: Currency
    language?: Language
    method?: PaymentMethod
    invoice?: {
        name: string
        country: string
        state: string
        city: string
        zip: string
        address: string
        address2?: string
        phone?: string
    }
}

export interface PaymentConfig {
    redirectUrl?: string
}

export type ISO8601DateString = string
export interface Recurring {
    times: number,
    until: ISO8601DateString,
    maxAmount: number
}
export interface RecurringPaymentData extends PaymentData {
    customer: string,
    recurring: Recurring
}

export interface TokenPaymentData extends Omit<PaymentData, 'method'> {
    method: 'CARD',
    customer: string,
    token: string
}

export interface SimplePayRequestBody extends Omit<PaymentData, 'total'> {
    total: string
    salt: string
    merchant: string
    sdkVersion: string
    methods: PaymentMethod[]
    timeout: string
    url: string
}

export interface SimplePayRecurringRequestBody extends SimplePayRequestBody {
    customer: string
    recurring: Recurring
    threeDSReqAuthMethod: '02'  // only registered users can use this
}

export interface SimplePayTokenRequestBody extends SimplePayRequestBody {
    customer: string
    token: string
    threeDSReqAuthMethod: '02'  // only registered users can use this
    type: 'MIT' // Merchant Initiated Transaction
}

export interface SimplePayCancelCardRequestBody {
    salt: string
    cardId: string
    merchant: string
    sdkVersion: string
}

export interface GooglePayPaymentData {
    orderRef: string
    total: number | string
    customerEmail: string
    googlePayToken: string
    currency?: Currency
    language?: Language
    invoice?: PaymentData['invoice']
}

export interface SimplePayGooglePayRequestBody {
    salt: string
    merchant: string
    googlePayToken: string
    sdkVersion: string
    currency: Currency
    total: string
    type: 'CIT'
    orderRef: string
    url: string
    customerEmail: string
    language: Language
    timeout: ISO8601DateString
    invoice?: PaymentData['invoice']
}

export interface SimplePayResponse {
    salt: string
    merchant: string
    orderRef: string
    currency: Currency
    transactionId: string
    timeout: ISO8601DateString
    total: string
    paymentUrl: string
    errorCodes?: string[]
}

export interface SimplePayGooglePayResponse {
    salt?: string
    merchant: string
    orderRef: string
    currency: Currency
    transactionId: string | number
    total: string | number
    timeout?: ISO8601DateString
    paymentUrl?: string
    redirectUrl?: string
    errorCodes?: Array<string | number>
}

export interface ApplePayStartData {
    orderRef: string
    total: number | string
    customerEmail: string
    domain: string
    currency?: Currency
    language?: Language
    invoice?: PaymentData['invoice']
}

export interface ApplePayChargeData {
    transactionId: string | number
    applePayToken: string
    currency?: Currency
}

export interface ApplePayMerchantSession {
    epochTimestamp?: number
    expiresAt?: number
    merchantSessionIdentifier: string
    nonce?: string
    merchantIdentifier?: string
    domainName?: string
    displayName?: string
    signature?: string
    operationalAnalyticsIdentifier?: string
    retries?: number
    pspId?: string
}

export interface SimplePayApplePayStartRequestBody {
    salt: string
    merchant: string
    orderRef: string
    currency: Currency
    domain: string
    sdkVersion: string
    total: string
    customerEmail: string
    language: Language
    timeout: ISO8601DateString
    invoice?: PaymentData['invoice']
}

export interface SimplePayApplePayStartResponse {
    salt?: string
    merchant: string
    orderRef?: string
    currency?: Currency
    transactionId: string | number
    total?: string | number
    timeout?: ISO8601DateString
    applePaySession?: ApplePayMerchantSession
    errorCodes?: Array<string | number>
}

export interface SimplePayApplePayChargeRequestBody {
    salt: string
    merchant: string
    transactionId: number
    applePayToken: string
    sdkVersion: string
    currency: Currency
}

export interface SimplePayApplePayChargeResponse {
    salt?: string
    merchant: string
    orderRef?: string
    currency?: Currency
    transactionId: string | number
    total?: string | number
    applePayStatus?: string
    errorCodes?: Array<string | number>
}

export interface SimplePayRecurringResponse extends SimplePayResponse {
    tokens: string[]
}

export interface SimplePayTokenResponse extends Omit<SimplePayResponse, 'paymentUrl' | 'timeout'> { }

export interface SimplePayCancelCardResponse {
    salt: string
    merchant: string
    cardId: string
    status: 'DISABLED'
    expiry: string
}

export type SimplePayEvents = 'SUCCESS' | 'FAIL' | 'TIMEOUT' | 'CANCEL'

export interface SimplePayAPIResult {
    r: number   // response code
    t: string   // transaction id
    e: SimplePayEvents   // event
    m: string   // merchant id
    o: string   // order id
}

export interface SimplePayResult {
    responseCode: number,
    transactionId: string,
    event: SimplePayEvents,
    merchantId: string,
    orderRef: string,
    tokens?: string[],
}

export interface SimplePayIPNResponse {
    salt: string
    orderRef: string
    method: string
    merchant: string
    finishDate: string
    paymentDate: string
    transactionId: number
    status: 'FINISHED' | 'AUTHORIZED' | 'NOTAUTHORIZED' | 'REVERSED' | 'CANCELLED' | 'TIMEOUT'
    receiveDate: string
    expiry?: string
    cardMask?: string
}
