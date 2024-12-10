type PaymentMethod = 'CARD' | 'WIRE'

const CURRENCIES = ['HUF', 'EUR', 'USD'] as const
type Currency = typeof CURRENCIES[number]

const LANGUAGES = [
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
type Language = typeof LANGUAGES[number]

interface PaymentData {
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

type ISO8601DateString = string
interface Recurring {
    times: number,
    until: ISO8601DateString,
    maxAmount: number
}
interface RecurringPaymentData extends PaymentData {
    customer: string,
    recurring: Recurring
 }

interface SimplePayRequestBody extends Omit<PaymentData, 'total'> {
    total: string
    salt: string
    merchant: string
    sdkVersion: string
    methods: PaymentMethod[]
    timeout: string
    url: string
}

interface SimplePayRecurringRequestBody extends SimplePayRequestBody {
    customer: string
    recurring: Recurring
    threeDSReqAuthMethod: '02'  // only registered users can use this
}

interface SimplePayResponse {
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

interface SimplePayRecurringResponse extends SimplePayResponse {
    tokens: string[]
}

interface SimplepayResult {
    r: number   // response code
    t: string   // transaction id
    e: 'success' | 'fail' | 'timeout' | 'cancel'   // event
    m: string   // merchant id
    o: string   // order id
}

export { PaymentData, SimplePayRequestBody, SimplePayResponse, SimplepayResult, RecurringPaymentData, CURRENCIES, Currency, PaymentMethod, LANGUAGES, Language, ISO8601DateString, SimplePayRecurringResponse, SimplePayRecurringRequestBody }