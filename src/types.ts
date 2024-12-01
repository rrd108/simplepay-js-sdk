interface PaymentData {
    orderRef: string
    total: number | string
    customerEmail: string
    currency?: string
    language?: string
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

interface SimplePayRequestBody extends Omit<PaymentData, 'total'> {
    total: string
    salt: string
    merchant: string
    sdkVersion: string
    methods: ['CARD']
    timeout: string
    url: string
}

interface SimplePayResponse {
    salt: string
    merchant: string
    orderRef: string
    currency: string
    transactionId: string
    timeout: string
    total: string
    paymentUrl: string
    errorCodes?: string[]
}

interface SimplepayResult {
    r: number   // response code
    t: string   // transaction id
    e: 'success' | 'fail' | 'timeout' | 'cancel'   // event
    m: string   // merchant id
    o: string   // order id
}

export { PaymentData, SimplePayRequestBody, SimplePayResponse, SimplepayResult }