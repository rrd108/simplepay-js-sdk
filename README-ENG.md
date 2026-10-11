# SimplePay JS SDK

[Magyar README](README.md)

A lightweight utility for integrating Hungary's SimplePay payments in Node.js applications.

![SimplePay Logo](simplepay_logo.jpg)

Please read the [SimplePay documentation](https://simplepay.hu/fejlesztoknek) for more information.

> 🫵 If this package is useful to you, please star it on GitHub.

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
- `SIMPLEPAY_MERCHANT_KEY_HUF` Your Simplepay secret merchant key. Set `SIMPLEPAY_MERCHANT_KEY_HUF_SZEP` for accepting SZÉP kártyás payments. Set `SIMPLEPAY_MERCHANT_KEY_EUR` and `SIMPLEPAY_MERCHANT_KEY_USD` for accepting EUR and USD payments.
- `SIMPLEPAY_MERCHANT_ID_HUF` Your Simplepay merchant id. Set `SIMPLEPAY_MERCHANT_ID_HUF_SZEP` for accepting SZÉP kártyás payments. Set `SIMPLEPAY_MERCHANT_ID_EUR` and `SIMPLEPAY_MERCHANT_ID_USD` for accepting EUR and USD payments.
- `SIMPLEPAY_PRODUCTION` If it set to `true`, it will use production environment, otherwise it will use sandbox environment.
- `SIMPLEPAY_REDIRECT_URL` The URL of your site, where the customer will be redirected after the payment. Can also be provided when starting a payment so you can define different redirect urls for different payments.

## Usage

You should create 3 endpoints, to start the payment, get the payment response and handle the IPN.

### One Time Payment

#### Start Payment Endpoint

```typescript
import { startPayment } from 'simplepay-js-sdk'

try {
  const response = await startPayment({
    orderRef: 'order-12',
    total: 1212,
    currency: 'HUF', // optional, HUF | HUF_SZEP | EUR | USD, defaults to HUF
    customerEmail: 'rrd@webmania.cc',
    language: 'HU', // optional, AR | BG | CS | DE | EN | ES | FR | IT | HR | HU | PL | RO | RU | SK | TR | ZH, defaults to HU
    method: 'CARD', // optional, CARD | WIRE, defaults to CARD
    invoice: {
      name: 'Radharadhya Dasa',
      country: 'HU',
      state: 'Budapest',
      city: 'Budapest',
      zip: '1234',
      address: 'Sehol u. 0',
    },
  }, {
    redirectUrl: 'http://url.to.redirect' // optional, defaults to the value of the SIMPLEPAY_REDIRECT_URL environment variable
  })
  return response
} catch (error) {
  console.error('Payment initiation failed:', error)
  return error
}
```

`response.paymentUrl` will contain the Simplepay payment URL, which you can redirect the customer to.

#### Get Payment Response Endpoint

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
- `orderRef`: the order id

#### IPN Endpoint

Simplepay will send a `POST` request to the IPN url and you should send a response back.

**Recommended approach using `handleIpnRequest` function:**

```typescript
import { handleIpnRequest } from 'simplepay-js-sdk'

// In your IPN endpoint handler (e.g., Express, Next.js, etc.)
const ipnBody = await request.text() // Get raw body as string (IMPORTANT: use .text(), not JSON.parse())
const incomingSignature = request.headers.get('Signature')
const { MERCHANT_KEY } = getSimplePayConfig('HUF') // or your currency

const { responseBody, signature } = handleIpnRequest(ipnBody, incomingSignature, MERCHANT_KEY)

// CRITICAL: Send responseBody exactly as returned, do NOT modify it!
// Do NOT:
// - Re-format or pretty-print the JSON
// - Parse and re-stringify the JSON
// - Add any whitespace or formatting
// Any modification will invalidate the signature!

// Send response with HTTP 200 status
return new Response(responseBody, {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    'Signature': signature
  }
})
```

**Manual approach:**

If you prefer to handle it manually:

- check if the signature is valid - use `checkSignature(ipnBody, signatureHeader, SIMPLEPAY_MERCHANT_KEY_HUF)`
- add a `receiveDate` property to the received JSON (ISO 8601 format, e.g., `2025-10-06T07:00:34+02:00`)
- calculate the new signature - use `generateSignature(responseText, SIMPLEPAY_MERCHANT_KEY_HUF)`
- send the `response` with the new `signature` in the HTTP header (not in the JSON body)
- **Important**: The response JSON must be compact (no whitespace). `JSON.stringify()` produces compact JSON by default.


### Google Pay

Merchant-hosted Google Pay uses a browser button and a server call to SimplePay `doGooglePay`. Fulfil the order from the IPN. After a 3DS challenge, SimplePay returns the customer to your `redirectUrl` with `r` and `s`, and `getPaymentResponse` verifies that return. When no 3DS challenge is required, the customer stays on the payment page.

The amount charged is the `total` your server passes to `startGooglePay`. The amount in the Google Pay sheet is what the customer sees.

Before production, create a merchant profile in the Google Pay & Wallet Console, approve your checkout domain, and send the Google merchant id to SimplePay. Use your SimplePay merchant id as `gatewayMerchantId`. Sandbox uses Google Pay environment `TEST`.

#### Browser button

```typescript
import { renderGooglePayButton } from 'simplepay-js-sdk/google-pay'

await renderGooglePayButton({
  container: '#google-pay',
  merchantId: 'YOUR_GOOGLE_MERCHANT_ID',
  merchantName: 'Shop Name',
  environment: 'TEST', // TEST | PRODUCTION
  gatewayMerchantId: 'YOUR_SIMPLEPAY_MERCHANT_ID',
  authorizationEndpoint: '/api/google-pay',
  currency: 'HUF',
  total: '1212',
  orderRef: 'order-12',
  onResult: (result) => {
    console.log(result)
  },
  onError: (error) => {
    console.error(error)
  },
})
```

The button posts `{ googlePayToken, orderRef }` to `authorizationEndpoint`. `googlePayToken` is already base64. Pass that value to `startGooglePay` unchanged.

#### Server

Read the order on the server and charge that total. Return the SimplePay response to the browser. When it contains error code `3004` and `redirectUrl`, the button sends the customer to the 3DS challenge.

```typescript
import { startGooglePay } from 'simplepay-js-sdk'

const order = await loadOrder(orderRef)
const response = await startGooglePay({
  orderRef: order.orderRef,
  total: order.total,
  currency: 'HUF',
  customerEmail: order.email,
  language: 'HU',
  googlePayToken, // base64 token from the browser
}, {
  redirectUrl: 'https://yoursite.com/payment/callback',
})
return response
```

`HUF_SZEP` is not available for Google Pay. In production the return URL must be absolute `https`.

### Recurring Payment

#### Start Recurring Payment Endpoint

Here you have to use the `startRecurringPayment()` function what works the same way as the `startPayment()` function. The only difference is that you have to pass 2 additional properties: `customer` and `recurring`.

```typescript
try {
  const response = await startRecurringPayment({
    // ... other preoperties
    customer: 'Radharadhya Dasa',
    recurring: {
      times: 3, // how many times the payment will be made, number of tokens
      until: '2025-12-31T18:00:00+02:00', // the end date of the recurring payment - use the toISO8601DateString() helper function
      maxAmount: 100000 // the maximum amount of the recurring payment
    }
  })
}
```

The response will have an additional `tokens` property, what will contain the tokens of the registered cards.
You are responsible to save the tokens to your database, so you can use them later to make a payment.


#### Get Recurring Payment Response Endpoint

Use the same enpoint as the one time payment.

#### IPN Endpoint on card registration

It works the same as the `IPN` endpoint of the one time payment.
The response will have the same properties, and 2 additional properties:

 - `cardMask`: xxxx-xxxx-xxxx-1234 - the masked card number what is registered
 - `expiry`: 2025-01-31T00:00:00+02:00 - the expiry date of the registered card

 #### Token Payment Endpoint

 After a card is registered you can use the tokens to make a payment without any user intercation for example by a daily `cron`

```typescript
import { startTokenPayment } from 'simplepay-js-sdk'

// TODO: get payment data from your database, where you saved the tokens

const payment = {
  token: '1234567890123456',
  total: 1212,
  currency: 'HUF' as Currency,
  customer: 'Radharadhya Dasa',
  customerEmail: 'rrd@webmania.cc',
  invoice: {
    name: 'Radharadhya Dasa',
    country: 'HU',
    state: 'Budapest',
    city: 'Budapest',
    zip: '1234',
    address: 'Sehol u. 0',
  },
}

try {
  const response = await startTokenPayment({
    orderRef: Date.now().toString(),
    language: 'HU',
    method: 'CARD', // must be CARD
    ...payment,
  })
  return response
} catch (error) {
  console.error('Token payment initiation failed:', error)
  return error
}
```

#### Card Cancelation

Paying customers should be able to delete their registered card on the website.
To do this, use the `cancelCard` function. Use SimplePay transaction id of the card registration transaction as `cardId`.

```typescript
import { cancelCard } from 'simplepay-js-sdk'

try {
  const response = await cancelCard(cardId)
  
  if (response.status == 'DISABLED') {
    // The card has been successfully deleted
    // TODO: delete the unused tokens and the card from the database
  }
  return response
} catch (error) {
  console.error('Card deletion failed:', error)
  return error
}
```

## Agent Skill

This library is available as an [Agent Skill](https://skills.sh) for AI coding agents. Install it to give your agent knowledge about SimplePay integration:

```bash
npx skills add rrd108/simplepay-js-sdk
```

## License

MIT
