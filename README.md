# Simplepay JS SDK

A lightweight utility for integrating SimplePay payments in Node.js applications.

## Installation

```bash
# npm
npm install simplepay-js-sdk

# yarn
yarn add simplepay-js-sdk

# pnpm
pnpm add simplepay-js-sdk
```

## Configuration

Set the following environment variables in your `.env` file:

- `SIMPLEPAY_LOGGER` If it set to `true`, it will log varibles - useful only for debugging.
- `SIMPLEPAY_MERCHANT_KEY` Your Simplepay secret merchant key.
- `SIMPLEPAY_MERCHANT_ID` Your Simplepay merchant id.
- `SIMPLEPAY_PRODUCTION` If it set to `true`, it will use production environment, otherwise it will use sandbox environment.
- `SIMPLEPAY_REDIRECT_URL` The URL of your site, where the customer will be redirected after the payment.

## Usage

### Start Payment Endpoint

```typescript
import { startPayment } from 'simplepay-js-sdk'

try {
  const response = await startPayment({
    orderRef: 'order-12',
    total: 1212,
    customerEmail: 'rrd@webmania.cc',
    invoice: {
      name: 'Radharadhya Dasa',
      country: 'HU',
      state: 'Budapest',
      city: 'Budapest',
      zip: '1234',
      address: 'Sehol u. 0',
    },
  })
  return response
} catch (error) {
  console.error('Payment initiation failed:', error)
  return error
}
```

`response.paymentUrl` will contain the Simplepay payment URL, which you can redirect the customer to.

### Get Payment Response Endpoint

When the customer returns from the Simplepay payment page, you need to get the payment response at your `SIMPLEPAY_REDIRECT_URL`. The url will contain 2 parameters: `r` and `s`.

```typescript
import { getPaymentResponse } from 'simplepay-js-sdk'

// get "r" and "s" from the url the way you do it on your app and framework

const response = getPaymentResponse(r, s)
```

`response` will have the following properties:

- `responseCode`: `0` on success, or an error code
- `transactionId`: the transaction id
- `event`: the event type: `success` | `fail` | `timeout` | `cancel`
- `merchantId`: the merchant id
- `orderId`: the order id

### IPN Endpoint

Simplepay will send a `POST` request to the IPN url and you should send a response back.
At this endpoint you should

- check if the signature is valid - use `checkSignature(ipnBody, signatureHeader, SIMPLEPAY_MERCHANT_KEY)`
- add a `receiveDate` property to the received JSON
- calculate the new signature - use `generateSignature(responseText, SIMPLEPAY_MERCHANT_KEY)`
- send the `response` with the new `signature`

## License

MIT
