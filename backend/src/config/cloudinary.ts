import { v2 as cloudinary } from 'cloudinary'
import { config } from './index.js'

/**
 * True when all three Cloudinary credentials are present.
 *
 * The upload route checks this before touching multer, so a deployment without
 * a photo backend answers 503 on that one route instead of the whole process
 * failing to boot. `config/index.ts` parses the env before this module runs, so
 * reading it here is safe.
 */
export const isCloudinaryConfigured =
  config.cloudinary.cloudName.length > 0 &&
  config.cloudinary.apiKey.length > 0 &&
  config.cloudinary.apiSecret.length > 0

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    // Delivered over https even when the API is called from a dev machine.
    secure: true,
  })
}

export default cloudinary
