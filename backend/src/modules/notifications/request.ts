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
/**
 * P-03: a police officer named the volunteer, so both sides are told. The
 * volunteer still has to accept, and the senior is told a named volunteer is
 * now on the way rather than "someone nearby".
 */
export async function notifyPoliceAssignment(
  volunteer: Recipient & { fullName: string | null },
  senior: Recipient,
  request: { id: string; category: string },
): Promise<void> {
  const toVolunteer = {
    title: 'Police assigned you a request',
    body: `A "${request.category}" request was assigned to you by police. Open Sahayak to accept it.`,
  }
  await pushOrLog(volunteer.fcmToken, toVolunteer.title, toVolunteer.body, {
    type: 'request_assigned',
    request_id: request.id,
  })
  try {
    await sendEmail(volunteer.email, `Sahayak: ${toVolunteer.title}`, toVolunteer.body)
  } catch (err) {
    logger.error('[notify] email failed', err)
  }

  const toSenior = {
    title: 'A volunteer was assigned to your request',
    body: `${volunteer.fullName || 'A volunteer'} was assigned to your "${request.category}" request by police and has been asked to accept.`,
  }
  await pushOrLog(senior.fcmToken, toSenior.title, toSenior.body, {
    type: 'request_assigned',
    request_id: request.id,
  })
  try {
    await sendEmail(senior.email, `Sahayak: ${toSenior.title}`, toSenior.body)
  } catch (err) {
    logger.error('[notify] email failed', err)
  }
}
