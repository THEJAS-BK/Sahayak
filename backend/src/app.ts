import express from 'express'
import type { Express } from 'express'
import apiRouter from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

export function createApp(): Express {
  const app = express()

  // Dev CORS: allow the Flutter web/desktop builds to call this API. In
  // production the app talks to the API from the same origin, so no policy
  // needs to be provisioned here.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}