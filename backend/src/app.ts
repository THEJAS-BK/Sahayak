import express from 'express'
import type { Express } from 'express'
import apiRouter from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

export function createApp(): Express {
  const app = express()

  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}