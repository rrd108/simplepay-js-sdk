import { describe, it, expect } from 'vitest'
import { checkSignature, generateSignature } from './index'

describe('generateSignature', () => {
    it('should generate correct signature for sample payload from documentation', () => {
        const merchantKey = 'FxDa5w314kLlNseq2sKuVwaqZshZT5d6'
        const body = {
            salt: 'c1ca1d0e9fc2323b3dda7cf145e36f5e',
            merchant: 'PUBLICTESTHUF',
            orderRef: '101010516348232058105',
            currency: 'HUF',
            customerEmail: 'sdk_test@otpmobil.com',
            language: 'HU',
            sdkVersion: 'SimplePayV2.1_Payment_PHP_SDK_2.0.7_190701:dd236896400d7463677a82a47f53e36e',
            methods: ['CARD'],
            total: '25',
            timeout: '2021-10-30T12:30:11+00:00',
            url: 'https://sdk.simplepay.hu/back.php',
        }

        let bodyString = JSON.stringify(body)
        // after stringify we should insert backslashes for the url
        bodyString = bodyString.replace(/\//g, '\\/')

        const result = generateSignature(bodyString, merchantKey)

        const expectedSignature = 'gcDJ8J7TyT1rC/Ygj/8CihXaLwniMWRav09QSEMQUnv5TbYaEDvQAuBE1mW3plvZ'
        expect(result).toBe(expectedSignature)
    })
})


describe('checkSignature', () => {
    it('should generate correct signature for the response', () => {
        const merchantKey = 'P085602'
        const response = {
            transactionId: '504226393',
            orderRef: 'ORDER124',
            merchant: merchantKey,
            timeout: '2024-11-29T13:29:17+01:00',
            total: '1000',
            paymentUrl: 'https://sb-checkout.simplepay.hu/trx/cJZs3UUc48FlGu7Mfa1M0tcTWO53oA5RxS0OUMPqA17Fe3HGBr',
            currency: 'HUF',
            salt: 'R0ZBm2gdCXuTmxpOkqB4s0aAhZxZwSWG'
        }

        const expectedSignature = 'W98O/EdHobsWJTw2U1xUuUWXtCaJnTnzq5Na8ddCKE4gm2IW7vro33tGAW55YPf6'
        const result = checkSignature(JSON.stringify(response).replace(/\//g, '\\/'), expectedSignature, merchantKey)
        expect(result).toBeTruthy()
    })
})
