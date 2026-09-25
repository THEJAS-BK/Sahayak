import { logger } from '../../lib/logger.js'
import { sendEmail } from './email.js'
import { sendPush } from './push.js'

export interface Recipient {
  email: string
  fcmToken: string | null
}

async function pushOrLog(token: string | null | undefined, title: string, body: string, data: Record<string, string>) {
  if (!token) return
  try {
    await sendPush({ token, title, body, data })
  } catch (err) {
    logger.error('[notify] push failed', err)
  }
}

export async function notifyDispatch(
  candidates: Array<{ id: string; fcmToken: string | null }>,
  requestId: string,
  category: string,
): Promise<void> {
  for (const c of candidates) {
    await pushOrLog(c.fcmToken, 'New help request nearby', `A "${category}" request needs help`, {
      type: 'request_dispatched',
      request_id: requestId,
    })
  }
}

export async function notifyRequestAccepted(recipient: Recipient, volunteerName: string): Promise<void> {
  const title = 'Volunteer accepted your request'
  const body = `${volunteerName || 'A volunteer'} accepted your help request.`
  await pushOrLog(recipient.fcmToken, title, body, { type: 'request_accepted' })
  try {
    await sendEmail(recipient.email, `Sahayak: ${title}`, body)
  } catch (err) {
    logger.error('[notify] email failed', err)
  }
}

export async function notifyRequestStatus(
  recipient: Recipient,
  status: 'IN_PROGRESS' | 'COMPLETED',
): Promise<void> {
  const title = status === 'COMPLETED' ? 'Help request completed' : 'Volunteer is on the way'
  const body =
    status === 'COMPLETED'
      ? 'The volunteer has completed your request. Thank you.'
      : 'The volunteer is now working on your request.'
  await pushOrLog(recipient.fcmToken, title, body, { type: `request_${status.toLowerCase()}` })
}