import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { CloudinaryStorage } from 'multer-storage-cloudinary-v2'
import cloudinary from '../config/cloudinary.js'
import { config } from '../config/index.js'
import { errors } from '../lib/errors.js'

/** Hard cap on the upload. Cloudinary's own free-tier limit is far higher. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const storage = new CloudinaryStorage({
  // The CloudinaryStorage typings describe the v1 `Cloudinary` interface, which
  // no longer matches the v2 SDK's config shape; the runtime accepts it.
  cloudinary: cloudinary as never,
  params: {
    folder: config.cloudinary.folder,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      {
        width: 1000,
        height: 1000,
        // Never upscale: a 400px snapshot stays 400px rather than being blown
        // up to 1000 and re-encoded for nothing.
        crop: 'limit',
        quality: 'auto',
        fetch_format: 'auto',
      },
    ],
  },
})

const uploader = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as (typeof IMAGE_MIME_TYPES)[number])) {
      cb(errors.badRequest(`Unsupported image type: ${file.mimetype}`, 'UNSUPPORTED_IMAGE_TYPE'))
      return
    }
    cb(null, true)
  },
})

/**
 * Rejects the request before multer touches the socket when Cloudinary is not
 * configured, so the caller gets a clear 503 instead of a stream that dies
 * halfway through a 5 MB upload.
 */
export function requireCloudinary(_req: Request, _res: Response, next: NextFunction): void {
  if (config.cloudinary.cloudName === '') {
    next(errors.badRequest('Photo uploads are not configured on this server', 'IMAGE_UPLOAD_UNAVAILABLE'))
    return
  }
  next()
}

/**
 * Single-file image upload on the `photo` field, streamed straight to
 * Cloudinary. On success `req.file` is an `Express.Multer.File` whose
 * `path` is the https URL and `filename` the Cloudinary public id.
 *
 * Multer reports failures (size, mime, aborted stream) through its callback
 * rather than by throwing, so they are translated here: left unhandled they
 * would fall through to the central error handler as an unknown error and
 * every client would see a 500.
 */
export function uploadImageField(req: Request, res: Response, next: NextFunction): void {
  uploader.single('photo')(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          errors.badRequest(
            `Photo must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller`,
            'PHOTO_TOO_LARGE',
          ),
        )
        return
      }
      next(errors.badRequest(`Upload failed: ${err.message}`, 'UPLOAD_FAILED'))
      return
    }
    next(err)
  })
}
