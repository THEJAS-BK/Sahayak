import { createApp } from './app.js'
import { config } from './config/index.js'
import { logger } from './lib/logger.js'
import { startBackgroundJobs } from './jobs/index.js'

const app = createApp()
startBackgroundJobs()

app.listen(config.port, () => {
  logger.info(`Sahayak backend listening on http://localhost:${config.port} (${config.nodeEnv})`)
})