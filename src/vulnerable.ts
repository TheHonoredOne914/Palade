import { execSync } from 'child_process'
import express from 'express'

const app = express()

app.get('/ping', (req, res) => {
  const ip = req.query.ip
  // CRITICAL SECURITY FLAW: Command Injection
  const result = execSync('ping -c 4 ' + ip)
  res.send(result.toString())
})

app.listen(3000)
