import { Router } from 'express'
import { formatDate } from '../utils.js'

const router = Router()

// @palade focus: input validation
router.get('/users', (req, res) => {
  const name = req.query.name as string
  const email = req.query.email as string

  // No input validation whatsoever
  const users = [
    { name, email, createdAt: formatDate(new Date()) }
  ]

  res.json(users)
})

export default router
