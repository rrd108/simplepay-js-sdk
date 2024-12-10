import crypto from 'crypto'

const generateSignature = (body, merchantKey) => {
    const hmac = crypto.createHmac('sha384', merchantKey.trim())
    hmac.update(body, 'utf8')
    return hmac.digest('base64')
}

// Yaakban a JSONban nem lehet szóköz, újsor, tab!!!

// const merchantKey = 'FxDa5w314kLlNseq2sKuVwaqZshZT5d6'
// const body = JSON.stringify({
//     salt: 'c1ca1d0e9fc2323b3dda7cf145e36f5e',
//     merchant: 'PUBLICTESTHUF',
//     orderRef: '101010516348232058105',
//     currency: 'HUF',
//     customerEmail: 'sdk_test@otpmobil.com',
//     language: 'HU',
//     sdkVersion: 'SimplePayV2.1_Payment_PHP_SDK_2.0.7_190701:dd236896400d7463677a82a47f53e36e',
//     methods: ['CARD'],
//     total: '25',
//     timeout: '2021-10-30T12:30:11+00:00',
//     url: 'https://sdk.simplepay.hu/back.php',
// })


// If the url is escpaed or not escaped we get the same signature
const merchantKey = 'secretEuroKey'
const body = JSON.stringify({r: 0, t: 504233881, e: 'SUCCESS', m: 'merchantEuroId', o: 'c-1-eur' })
let bodyString = body.replace(/\//g, '\\/')
console.log(bodyString)

const signature = generateSignature(bodyString, merchantKey)
console.log(signature)

// 5302: Nem megfelelő aláírás (signature) a beérkező kérésben. (A kereskedői API-ra érkező hívás aláírás - ellenőrzése sikertelen.
// 5321: Érvénytelen JSON

/**
 * response: {
  "transactionId": 504233859,
  "orderRef": "wire-5",
  "merchant": "P085602",
  "timeout": "2024-12-04T17:46:22+01:00",
  "total": 1212,
  "paymentUrl": "https://sb-checkout.simplepay.hu/trx/5CeOehccgIHNpHDsMb2M4EdTXK631g_hxS4x-IASwxNoGbe2BT",
  "currency": "HUF",
  "salt": "5gvuhaONuLBGsBaYn9WyeVjXPJ0zL7l8"
}
 */

/**
 * payment responese: {"r":0,"t":504233862,"e":"SUCCESS","m":"P085602","o":"c-1"}
 */