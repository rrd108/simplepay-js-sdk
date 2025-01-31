# SimplePay JS SDK

[English README](README-ENG.md)

Egy pehelysúlyú segédprogram a magyarországi SimplePay fizetések integrálásához Node.js alkalmazásokban.

![SimplePay Logo](simplepay_logo.jpg)

További információkért kérlek, olvasd el a [SimplePay dokumentációt](https://simplepay.hu/fejlesztoknek).

> 🫵 Ha a csomag hasznos a számodra, akkor ne feletjs el rányomni a star-ra GitHub-on.

## Telepítés

```bash
# npm
npm install simplepay-js-sdk

# yarn
yarn add simplepay-js-sdk

# pnpm
pnpm add simplepay-js-sdk
```

## Konfiguráció

Állítsd be a következő környezeti változókat a `.env` fájlban:

- `SIMPLEPAY_LOGGER` Ha `true`-ra van állítva, naplózza a változókat - csak hibakereséshez hasznos.
- `SIMPLEPAY_MERCHANT_KEY_HUF` A te SimplePay titkos kereskedői kulcsod. Állítsd be a `SIMPLEPAY_MERCHANT_KEY_EUR` és `SIMPLEPAY_MERCHANT_KEY_USD` értékeket EUR és USD fizetések elfogadásához.
- `SIMPLEPAY_MERCHANT_ID_HUF` A te SimplePay kereskedői azonosítód. Állítsd be a `SIMPLEPAY_MERCHANT_ID_EUR` és `SIMPLEPAY_MERCHANT_ID_USD` értékeket EUR és USD fizetések elfogadásához.
- `SIMPLEPAY_PRODUCTION` Ha `true`-ra van állítva, éles környezetet használ, egyébként teszt környezetet.
- `SIMPLEPAY_REDIRECT_URL` A te weboldalad URL-je, ahova a vásárló átirányításra kerül a fizetés után. Ez a fizetés indításakor is megadható, így különböző redirect url-eket definiálhatsz különböző fizetésekhez.

## Használat

Három végpontot kell létrehoznia: egyet a fizetés indításához, egyet a fizetési válasz fogadásához és egyet az IPN kezeléséhez.

### Egyszeri fizetés

#### Fizetés indítása végpont

```typescript
import { startPayment } from 'simplepay-js-sdk'

try {
  const response = await startPayment({
    orderRef: 'order-12',
    total: 1212,
    currency: 'HUF', // opcionális, HUF | EUR | USD, alapértelmezett: HUF
    customerEmail: 'rrd@webmania.cc',
    language: 'HU', // opcionális, AR | BG | CS | DE | EN | ES | FR | IT | HR | HU | PL | RO | RU | SK | TR | ZH, alapértelmezett: HU
    method: 'CARD', // opcionális, CARD | WIRE, alapértelmezett: CARD
    invoice: {
      name: 'Radharadhya Dasa',
      country: 'HU',
      state: 'Budapest',
      city: 'Budapest',
      zip: '1234',
      address: 'Sehol u. 0',
    },
  }, {
    redirectUrl: 'http://url.to.redirect' // opcionális, alapértelmezetten a SIMPLEPAY_REDIRECT_URL környezeti változó értéke
  })
  return response
} catch (error) {
  console.error('Fizetés indítása sikertelen:', error)
  return error
}
```

A `response.paymentUrl` tartalmazza a SimplePay fizetési URL-t, ahova a vásárlót átirányíthatja.

#### Fizetési válasz fogadása végpont

Amikor a vásárló visszatér a SimplePay fizetési oldalról, a fizetési választ a `SIMPLEPAY_REDIRECT_URL` címen kell fogadni. Az URL két paramétert tartalmaz: `r` és `s`.

```typescript
import { getPaymentResponse } from 'simplepay-js-sdk'

// az "r" és "s" paraméterek kinyerése az URL-ből az alkalmazásod és keretrendszerének megfelelően

const response = getPaymentResponse(r, s)
```

A `response` a következő tulajdonságokkal rendelkezik:

- `responseCode`: `0` siker esetén, vagy hibakód
- `transactionId`: a tranzakció azonosítója
- `event`: az esemény típusa: `success` | `fail` | `timeout` | `cancel`
- `merchantId`: a kereskedő azonosítója
- `orderRef`: a rendelés azonosítója

#### IPN végpont

A SimplePay `POST` kérést küld az IPN URL-re, és válaszolnunk kell rá.
Ennél a végpontnál a következőket kell tenned:

- ellenőrizd az aláírás érvényességét - használd a `checkSignature(ipnBody, signatureHeader, SIMPLEPAY_MERCHANT_KEY_HUF)` függvényt
- adj hozzá egy `receiveDate` tulajdonságot a kapott JSON-hoz
- számítsa ki az új aláírást - használd a `generateSignature(responseText, SIMPLEPAY_MERCHANT_KEY_HUF)` függvényt
- küldd el a `response`-t az új `signature`-rel

### Ismétlődő fizetés

#### Ismétlődő fizetés indítása végpont

Itt a `startRecurringPayment()` függvényt kell használnod, ami ugyanúgy működik, mint a `startPayment()`. Az egyetlen különbség, hogy két további tulajdonságot kell megadni: `customer` és `recurring`.

```typescript
try {
  const response = await startRecurringPayment({
    // ... egyéb tulajdonságok
    customer: 'Radharadhya Dasa',
    recurring: {
      times: 3, // hányszor történik meg a fizetés, tokenek száma
      until: '2025-12-31T18:00:00+02:00', // az ismétlődő fizetés végdátuma - használd a toISO8601DateString() segédfüggvényt
      maxAmount: 100000 // az ismétlődő fizetés maximális összege
    }
  })
}
```

A válasz egy további `tokens` tulajdonsággal rendelkezik, ami tartalmazza a regisztrált kártyák tokenjeit.
A te dolgod a tokenek mentése az adatbázisba, hogy később használhasd őket fizetéshez.

#### Ismétlődő fizetési válasz fogadása végpont

Használd ugyanazt a végpontot, mint az egyszeri fizetésnél.

#### IPN végpont kártyaregisztrációnál

Ugyanúgy működik, mint az egyszeri fizetés `IPN` végpontja.
A válasz ugyanazokkal a tulajdonságokkal rendelkezik, és 2 további tulajdonsággal:

- `cardMask`: xxxx-xxxx-xxxx-1234 - a regisztrált kártya maszkolt száma
- `expiry`: 2025-01-31T00:00:00+02:00 - a regisztrált kártya lejárati dátuma

#### Tokenes fizetés

Miután egy kártya regisztrálva van, használhatod a tokeneket fizetéshez felhasználói interakció nélkül, például napi `cron` feladattal

```typescript
import { startTokenPayment } from 'simplepay-js-sdk'

// TODO: fizetési adatok lekérése az adatbázisból, ahol a tokeneket tárolod

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
    method: 'CARD', // kötelezően CARD
    ...payment,
  })
  return response
} catch (error) {
  console.error('Token fizetés indítása sikertelen:', error)
  return error
}
```

#### Kártya törlése

A fizető ügyfelek számára lehetővé kell tenni, hogy a honlapodon belépve törölni tudja a regisztrált kártyáját.
Ehhez használd a `cancelCard` függvényt. `cardId`-ként a kártya regisztrációs tranzakció SimplePay azonosítóját kell megadnod.

```typescript
import { cancelCard } from 'simplepay-js-sdk'

try {
  const response = await cancelCard(cardId)
  
  if (response.status == 'DISABLED') {
    // A kártya sikeresen törölve
    // TODO: a fel nem használt tokenek és a kártya törlése az adatbázisból
  }
  return response
} catch (error) {
  console.error('Kártya törlése sikertelen:', error)
  return error
}
```

## Licenc

MIT