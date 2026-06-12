import { Router } from 'express'
import { formatDate } from '../utils.js'

const router = Router()

router.get('/products', (req, res) => {
  const name = req.query.name as string
  const email = req.query.email as string

  // Same validation logic copy-pasted from users.ts
  const products = [
    { name, email, createdAt: formatDate(new Date()) }
  ]

  res.json(products)
})

export default router
