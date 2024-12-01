# SimplePay Node.js Utility

A lightweight utility for integrating SimplePay payments in Node.js applications.

## Installation

```bash
npm install simplepay-js-sdk
```

## Usage

```typescript
import { startPayment, getPaymentResponse } from 'simplepay-nodejs-utility'

// Start a payment
const paymentResponse = await startPayment({
  orderRef: 'unique-order-reference',
  total: 1000,
  customerEmail: 'customer@example.com',
})

// Handle payment response
const result = getPaymentResponse(encodedResponse, signature)
```

## Configuration

Set the following environment variables:

- `SIMPLEPAY_MERCHANT_KEY`
- `SIMPLEPAY_MERCHANT_ID`
- `SIMPLEPAY_PRODUCTION`
- `SIMPLEPAY_REDIRECT_URL`

## License

MIT
