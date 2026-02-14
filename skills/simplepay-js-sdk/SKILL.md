---
name: simplepay-js-sdk
description: Best practices and integration guide for SimplePay payment processing in Node.js/TypeScript applications. Use this skill when implementing SimplePay payments, handling IPN callbacks, setting up recurring payments, or integrating Hungary's SimplePay gateway.
license: MIT
metadata:
  author: rrd108
  version: "0.12.3"
  organization: SimplePay JS SDK
  date: February 2026
  abstract: Complete integration guide for the simplepay-js-sdk npm package. Covers one-time payments, recurring payments, token-based payments, IPN handling, card cancellation, and security best practices for Hungary's SimplePay payment gateway.
---

# SimplePay JS SDK - Integration Guide

A lightweight TypeScript utility for integrating Hungary's SimplePay payments in Node.js applications. This skill provides procedural knowledge for AI agents to correctly implement SimplePay payment flows.

## When to Use This Skill

- Integrating SimplePay payment gateway in a Node.js or TypeScript project
- Implementing one-time card payments with SimplePay
- Setting up recurring/subscription payments
- Handling IPN (Instant Payment Notification) callbacks
- Processing token-based merchant-initiated payments
- Managing card registration and cancellation
- Working with Hungarian payment systems

## Installation

```bash
npm install simplepay-js-sdk
```

## Required Environment Variables

Set these in your `.env` file. **Never hardcode secrets in source code.**

```env
# Required
SIMPLEPAY_MERCHANT_KEY_HUF=your-secret-merchant-key
SIMPLEPAY_MERCHANT_ID_HUF=your-merchant-id
SIMPLEPAY_REDIRECT_URL=https://yoursite.com/payment/callback

# Optional - additional currencies
SIMPLEPAY_MERCHANT_KEY_EUR=your-eur-key
SIMPLEPAY_MERCHANT_ID_EUR=your-eur-id
SIMPLEPAY_MERCHANT_KEY_USD=your-usd-key
SIMPLEPAY_MERCHANT_ID_USD=your-usd-id

# Optional - SZEP card payments
SIMPLEPAY_MERCHANT_KEY_HUF_SZEP=your-szep-key
SIMPLEPAY_MERCHANT_ID_HUF_SZEP=your-szep-id

# Optional - environment
SIMPLEPAY_PRODUCTION=true  # omit or set to false for sandbox
SIMPLEPAY_LOGGER=true      # enable debug logging (development only)
```

## Architecture Overview

A SimplePay integration requires **three endpoints**:

1. **Start Payment Endpoint** - Initiates payment and redirects user to SimplePay
2. **Payment Response Endpoint** - Handles redirect back from SimplePay (at `SIMPLEPAY_REDIRECT_URL`)
3. **IPN Endpoint** - Receives server-to-server payment confirmations from SimplePay

## One-Time Payment Flow

### Step 1: Start a Payment

```typescript
import { startPayment } from 'simplepay-js-sdk'

const initiatePayment = async () => {
  try {
    const response = await startPayment({
      orderRef: 'order-12',
      total: 1212,
      currency: 'HUF',
      customerEmail: 'customer@example.com',
      language: 'HU',
      method: 'CARD',
      invoice: {
        name: 'Customer Name',
        country: 'HU',
        state: 'Budapest',
        city: 'Budapest',
        zip: '1234',
        address: 'Street 1',
      },
    }, {
      redirectUrl: 'https://yoursite.com/payment/callback',
    })
    // Redirect the user to response.paymentUrl
    return response
  } catch (error) {
    console.error('Payment initiation failed:', error)
    throw error
  }
}
```

**Parameters:**
- `orderRef` (required): Unique order reference string
- `total` (required): Payment amount (number or string)
- `customerEmail` (required): Customer's email address
- `currency` (optional): `'HUF'` | `'HUF_SZEP'` | `'EUR'` | `'USD'` (defaults to `'HUF'`)
- `language` (optional): `'HU'` | `'EN'` | `'DE'` | `'RO'` | etc. (defaults to `'HU'`)
- `method` (optional): `'CARD'` | `'WIRE'` (defaults to `'CARD'`)
- `invoice` (optional): Billing address object
- `redirectUrl` (optional): Override the `SIMPLEPAY_REDIRECT_URL` env variable

**Response:** Contains `paymentUrl` to redirect the customer to.

### Step 2: Handle Payment Response

When the customer returns from SimplePay, your redirect URL receives `r` and `s` query parameters.

```typescript
import { getPaymentResponse } from 'simplepay-js-sdk'

const handlePaymentReturn = (r: string, s: string) => {
  const response = getPaymentResponse(r, s)
  // response.event: 'SUCCESS' | 'FAIL' | 'TIMEOUT' | 'CANCEL'
  // response.responseCode: 0 on success
  // response.transactionId: SimplePay transaction ID
  // response.orderRef: your original order reference
  return response
}
```

### Step 3: Handle IPN (Instant Payment Notification)

SimplePay sends a POST request to your IPN endpoint. This is the **authoritative** payment confirmation.

```typescript
import { handleIpnRequest, getSimplePayConfig } from 'simplepay-js-sdk'

const handleIpn = async (request: Request) => {
  const ipnBody = await request.text() // IMPORTANT: use .text(), NOT .json()
  const incomingSignature = request.headers.get('Signature')
  const { MERCHANT_KEY } = getSimplePayConfig('HUF')

  const { responseBody, signature } = handleIpnRequest(
    ipnBody,
    incomingSignature,
    MERCHANT_KEY
  )

  // CRITICAL: Send responseBody exactly as returned - do NOT modify it
  return new Response(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Signature': signature,
    },
  })
}
```

**Critical IPN rules:**
- Always read the request body as raw text with `.text()`, never `.json()`
- Never re-format, pretty-print, or re-stringify the response body
- Any modification to `responseBody` invalidates the signature
- Always return HTTP 200 with the exact `responseBody` and `Signature` header

## Recurring Payment Flow

### Step 1: Register a Card with Recurring Payment

```typescript
import { startRecurringPayment } from 'simplepay-js-sdk'

const initiateRecurring = async () => {
  try {
    const response = await startRecurringPayment({
      orderRef: 'order-recurring-1',
      total: 1212,
      currency: 'HUF',
      customerEmail: 'customer@example.com',
      language: 'HU',
      customer: 'Customer Name',
      recurring: {
        times: 3,
        until: '2025-12-31T18:00:00+02:00',
        maxAmount: 100000,
      },
      invoice: {
        name: 'Customer Name',
        country: 'HU',
        state: 'Budapest',
        city: 'Budapest',
        zip: '1234',
        address: 'Street 1',
      },
    })
    // response.tokens contains the card tokens - save these to your database
    return response
  } catch (error) {
    console.error('Recurring payment initiation failed:', error)
    throw error
  }
}
```

**Additional parameters:**
- `customer` (required): Customer name string
- `recurring.times` (required): Number of tokens/payment occurrences
- `recurring.until` (required): End date in ISO 8601 format
- `recurring.maxAmount` (required): Maximum recurring payment amount

**Important:** Save the returned `tokens` array to your database for later token payments.

### Step 2: Make Token Payments

After card registration, use tokens for merchant-initiated payments (e.g., via cron job):

```typescript
import { startTokenPayment } from 'simplepay-js-sdk'
import type { Currency } from 'simplepay-js-sdk'

const processTokenPayment = async () => {
  try {
    const response = await startTokenPayment({
      orderRef: Date.now().toString(),
      token: '1234567890123456', // from your database
      total: 1212,
      currency: 'HUF' as Currency,
      customer: 'Customer Name',
      customerEmail: 'customer@example.com',
      language: 'HU',
      method: 'CARD',
      invoice: {
        name: 'Customer Name',
        country: 'HU',
        state: 'Budapest',
        city: 'Budapest',
        zip: '1234',
        address: 'Street 1',
      },
    })
    return response
  } catch (error) {
    console.error('Token payment failed:', error)
    throw error
  }
}
```

### Step 3: Cancel a Registered Card

Allow customers to remove their registered card:

```typescript
import { cancelCard } from 'simplepay-js-sdk'

const handleCardCancellation = async (cardId: string) => {
  try {
    const response = await cancelCard(cardId)
    if (response.status === 'DISABLED') {
      // Card successfully disabled - delete tokens from your database
    }
    return response
  } catch (error) {
    console.error('Card cancellation failed:', error)
    throw error
  }
}
```

Use the SimplePay transaction ID from the card registration as `cardId`.

## Recurring IPN Response

The IPN response for recurring payments includes two additional fields:
- `cardMask`: Masked card number (e.g., `xxxx-xxxx-xxxx-1234`)
- `expiry`: Card expiry date in ISO 8601 format

## Available Types

```typescript
import type {
  Currency,         // 'HUF' | 'HUF_SZEP' | 'EUR' | 'USD'
  Language,         // 'HU' | 'EN' | 'DE' | ... (16 languages)
  PaymentMethod,    // 'CARD' | 'WIRE'
  SimplePayResponse,
  SimplePayRecurringResponse,
  SimplePayTokenResponse,
  SimplePayCancelCardResponse,
  SimplePayResult,
  SimplePayIPNResponse,
} from 'simplepay-js-sdk'
```

## Utility Functions

```typescript
import {
  checkSignature,       // Verify HMAC-SHA384 signature
  generateSignature,    // Generate HMAC-SHA384 signature
  getPaymentResponse,   // Decode payment redirect response
  handleIpnRequest,     // Handle full IPN flow
  toISO8601DateString,  // Convert Date to SimplePay-compatible ISO 8601 string
} from 'simplepay-js-sdk'
```

### Manual Signature Operations

For advanced use cases:

```typescript
// Verify a signature
const isValid = checkSignature(bodyString, signatureHeader, merchantKey)

// Generate a signature
const signature = generateSignature(bodyString, merchantKey)

// Convert date to ISO 8601 format compatible with SimplePay
const dateStr = toISO8601DateString(new Date())
// Output: "2025-10-06T07:00:34+00:00"
```

## Security Best Practices

1. **Never expose merchant keys** - Keep `SIMPLEPAY_MERCHANT_KEY_*` in environment variables only
2. **Always validate signatures** - The SDK validates all response signatures automatically
3. **Use HTTPS** - All redirect and IPN URLs must use HTTPS in production
4. **Validate IPN server-side** - Never trust client-side redirect responses alone; always confirm via IPN
5. **Set `SIMPLEPAY_PRODUCTION=true`** only in production - Use sandbox for development and testing
6. **Disable logging in production** - Never set `SIMPLEPAY_LOGGER=true` in production environments
7. **Use unique `orderRef` values** - Prevent duplicate payment processing

## Common Mistakes to Avoid

- **Parsing IPN body as JSON before passing to `handleIpnRequest`** - Always use `.text()` to get the raw string
- **Modifying `responseBody` from `handleIpnRequest`** - Any change invalidates the HMAC signature
- **Forgetting the `Signature` header in IPN response** - SimplePay requires it
- **Using `CARD` method for WIRE payments** - Ensure `method` matches the payment type
- **Not saving recurring tokens** - Tokens from `startRecurringPayment` must be persisted
- **Using sandbox credentials in production** - Double-check `SIMPLEPAY_PRODUCTION` flag

## Framework Integration Examples

### Express.js

```typescript
import express from 'express'
import { startPayment, getPaymentResponse, handleIpnRequest, getSimplePayConfig } from 'simplepay-js-sdk'

const app = express()

app.post('/api/payment/start', async (req, res) => {
  try {
    const response = await startPayment({
      orderRef: req.body.orderRef,
      total: req.body.total,
      customerEmail: req.body.email,
      invoice: req.body.invoice,
    })
    res.json({ paymentUrl: response.paymentUrl })
  } catch (error) {
    res.status(500).json({ error: 'Payment failed' })
  }
})

app.get('/api/payment/callback', (req, res) => {
  const { r, s } = req.query
  const result = getPaymentResponse(r as string, s as string)
  // Handle result based on result.event
  res.redirect(`/payment/${result.event.toLowerCase()}`)
})

app.post('/api/payment/ipn', express.text({ type: '*/*' }), (req, res) => {
  const signature = req.headers['signature'] as string
  const { MERCHANT_KEY } = getSimplePayConfig('HUF')
  const { responseBody, signature: respSignature } = handleIpnRequest(req.body, signature, MERCHANT_KEY)
  res.set('Signature', respSignature).type('json').send(responseBody)
})
```

### Next.js App Router

```typescript
import { startPayment, handleIpnRequest, getSimplePayConfig } from 'simplepay-js-sdk'
import { NextRequest, NextResponse } from 'next/server'

// app/api/payment/start/route.ts
export const POST = async (request: NextRequest) => {
  const body = await request.json()
  try {
    const response = await startPayment({
      orderRef: body.orderRef,
      total: body.total,
      customerEmail: body.email,
      invoice: body.invoice,
    })
    return NextResponse.json({ paymentUrl: response.paymentUrl })
  } catch (error) {
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
  }
}

// app/api/payment/ipn/route.ts
export const POST = async (request: NextRequest) => {
  const ipnBody = await request.text()
  const signature = request.headers.get('Signature')
  const { MERCHANT_KEY } = getSimplePayConfig('HUF')
  const { responseBody, signature: respSignature } = handleIpnRequest(ipnBody, signature!, MERCHANT_KEY!)
  return new Response(responseBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Signature': respSignature },
  })
}
```

## References

- [SimplePay Developer Documentation](https://simplepay.hu/fejlesztoknek)
- [simplepay-js-sdk on npm](https://www.npmjs.com/package/simplepay-js-sdk)
- [GitHub Repository](https://github.com/rrd108/simplepay-js-sdk)
