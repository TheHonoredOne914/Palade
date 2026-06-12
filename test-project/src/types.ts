export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
}

export interface Product {
  id: string
  name: string
  price: number
  inStock: boolean
}
