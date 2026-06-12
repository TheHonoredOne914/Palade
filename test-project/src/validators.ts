import { User, Product } from './types.js'

export function validateUser(input: unknown): input is User {
  if (typeof input !== 'object' || input === null) return false
  const obj = input as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.email === 'string' &&
    (obj.role === 'admin' || obj.role === 'user')
  )
}

export function validateProduct(input: unknown): input is Product {
  if (typeof input !== 'object' || input === null) return false
  const obj = input as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.price === 'number' &&
    typeof obj.inStock === 'boolean'
  )
}
