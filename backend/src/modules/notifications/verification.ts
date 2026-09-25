import { logger } from '../../lib/logger.js'
import { sendEmail } from './email.js'
import { sendPush } from './push.js'

export interface VerificationResultInput {
  email: string
  fcmToken: string | null | undefined
  role: 'senior' | 'volunteer'
  status: 'APPROVED' | 'REJECTED'
  fullName: string
  reason: string | null
}

/**
 * Fired AFTER the review transaction commits. Send failures are logged, never
 * propagated.
 */
export async function notifyVerificationResult(input: VerificationResultInput): Promise<void> {
  const roleLabel = input.role === 'senior' ? 'Senior' : 'Volunteer'
  const heading = input.status === 'APPROVED' ? 'Application approved' : 'Application rejected'
  const body =
    input.status === 'APPROVED'
      ? `Your ${roleLabel.toLowerCase()} registration has been approved. You can now use Sahayak.`
      : `Your ${roleLabel.toLowerCase()} registration was not approved.${input.reason ? ` Reason: ${input.reason}` : ''}`

  try {
    await sendEmail(input.email, `Sahayak: ${heading}`, body)
  } catch (err) {
    logger.error('[notify] verification email failed', err)
  }

  if (input.fcmToken) {
    try {
      await sendPush({
        token: input.fcmToken,
        title: heading,
        body,
        data: { verification_status: input.status.toLowerCase() },
      })
    } catch (err) {
      logger.error('[notify] verification push failed', err)
    }
  }
}