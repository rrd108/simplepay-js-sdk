import { describe, it, expect, beforeEach } from 'vitest'
import { startPayment } from './oneTime'
import { startRecurringPayment, startTokenPayment, cancelCard } from './recurring'
import { generateSignature, checkSignature, getPaymentResponse } from './utils'

const setEnv = () => {
    process.env.SIMPLEPAY_MERCHANT_ID_HUF = 'testId'
    process.env.SIMPLEPAY_MERCHANT_KEY_HUF = 'testKey'
    process.env.SIMPLEPAY_MERCHANT_ID_EUR = 'merchantEuroId'
    process.env.SIMPLEPAY_MERCHANT_KEY_EUR = 'secretEuroKey'
}

describe('SimplePay Basic Tests', () => {
    beforeEach(() => {
        // Clear all environment variables before each test
        delete process.env.SIMPLEPAY_MERCHANT_ID_HUF
        delete process.env.SIMPLEPAY_MERCHANT_KEY_HUF
        delete process.env.SIMPLEPAY_MERCHANT_ID_EUR
        delete process.env.SIMPLEPAY_MERCHANT_KEY_EUR
    })

    describe('Basic Signature Tests', () => {
        it('should generate and verify signature correctly', () => {
            const merchantKey = 'testKey'
            const testData = { test: 'data' }
            const body = JSON.stringify(testData)
            
            const signature = generateSignature(body, merchantKey)
            const isValid = checkSignature(body, signature, merchantKey)
            
            expect(isValid).toBeTruthy()
        })
    })

    describe('Basic Payment Tests', () => {
        it('should throw error when merchant configuration is missing', async () => {
            const paymentData = {
                orderRef: 'TEST123',
                customerEmail: 'test@example.com',
                total: 1212
            }

            await expect(startPayment(paymentData)).rejects.toThrow('Missing SimplePay configuration')
        })

        it('should throw error when recurring merchant configuration is missing', async () => {
            const recurringPaymentData = {
                orderRef: 'TEST123',
                customerEmail: 'test@example.com',
                total: 1212,
                customer: 'Test Customer',
                recurring: {
                    times: 3,
                    until: '2025-12-31T23:59:59+00:00',
                    maxAmount: 12000
                }
            }

            await expect(startRecurringPayment(recurringPaymentData)).rejects.toThrow('Missing SimplePay configuration')
        })

        it('should throw error when token merchant configuration is missing', async () => {
            const tokenPaymentData = {
                orderRef: 'TEST123',
                customerEmail: 'test@example.com',
                total: 1212,
                customer: 'Test Customer',
                token: 'test-token',
                method: 'CARD' as const
            }

            await expect(startTokenPayment(tokenPaymentData)).rejects.toThrow('Missing SimplePay configuration')
        })
    })

    describe('Basic Response Tests', () => {
        it('should correctly decode and verify payment response', () => {
            setEnv()
            const mockResponse = {
                r: 0,
                t: 504233881,
                e: 'SUCCESS',
                m: 'merchantEuroId',
                o: 'test-order'
            }
            
            const encodedResponse = Buffer.from(JSON.stringify(mockResponse)).toString('base64')
            const signature = generateSignature(JSON.stringify(mockResponse), 'secretEuroKey')
            
            const result = getPaymentResponse(encodedResponse, signature)
            
            expect(result).toEqual({
                responseCode: 0,
                transactionId: 504233881,
                event: 'SUCCESS',
                merchantId: 'merchantEuroId',
                orderRef: 'test-order'
            })
        })

        it('should throw error for invalid signature in payment response', () => {
            setEnv()
            const mockResponse = {
                r: 0,
                t: 504233881,
                e: 'SUCCESS',
                m: 'merchantEuroId',
                o: 'test-order'
            }
            
            const encodedResponse = Buffer.from(JSON.stringify(mockResponse)).toString('base64')
            const invalidSignature = 'invalid-signature'
            
            expect(() => getPaymentResponse(encodedResponse, invalidSignature)).toThrow('Invalid response signature')
        })
    })

    describe('Basic Card Cancel Test', () => {
        it('should throw error when merchant configuration is missing for card cancel', async () => {
            await expect(cancelCard('test-card-id')).rejects.toThrow('Missing SimplePay configuration')
        })
    })
}) 