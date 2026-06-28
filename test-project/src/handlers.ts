import { validateUser, validateProduct } from './validators.js'
import { HTTP_BAD_REQUEST, HTTP_OK } from './constants.js'

export function handleUserCreation(body: unknown): { status: number; body: unknown } {
  if (!validateUser(body)) {
    return { status: HTTP_BAD_REQUEST, body: { error: 'Invalid user data' } }
  }
  return { status: HTTP_OK, body: { message: 'User created', user: body } }
}

export function handleProductCreation(body: unknown): { status: number; body: unknown } {
  if (!validateProduct(body)) {
    return { status: HTTP_BAD_REQUEST, body: { error: 'Invalid product data' } }
  }
  return { status: HTTP_OK, body: { message: 'Product created', product: body } }
}
