import { Router, Request, Response } from 'express';
import logger from '../utils/logger';

export interface ExotelIncomingCallRequest extends Request {
  body: {
    CallSid: string;
    From: string; // Caller's phone number
    To: string; // Exotel number called
    Direction: string;
    CallType: string;
    Status: string; // new, ongoing, complete
  };
}

/**
 * Create Exotel webhook routes
 * Handles incoming call notifications
 */
export function createExotelRouter(
  onIncomingCall?: (phoneNumber: string, callSid: string) => Promise<void>
): Router {
  const router = Router();

  /**
   * POST /exotel/incoming-call
   * Exotel calls this webhook when someone dials the Sahayak number
   */
  router.post('/incoming-call', async (req: ExotelIncomingCallRequest, res: Response) => {
    const { CallSid, From, To, Status } = req.body;

    logger.info(
      { callSid: CallSid, from: formatPhoneNumber(From), to: To, status: Status },
      'Incoming call received from Exotel'
    );

    try {
      // Only process new incoming calls
      if (Status === 'new') {
        // Notify conversation handler
        if (onIncomingCall) {
          await onIncomingCall(From, CallSid);
        }
      }

      // Always return 200 OK
      res.status(200).json({
        success: true,
        callSid: CallSid,
      });
    } catch (error) {
      logger.error(
        { error, callSid: CallSid },
        'Failed to handle incoming call'
      );

      res.status(500).json({
        success: false,
        error: 'Failed to process call',
      });
    }
  });

  /**
   * POST /exotel/call-status
   * Exotel sends call status updates (optional)
   */
  router.post('/call-status', (req: Request, res: Response) => {
    const { CallSid, Status, CallType } = req.body as any;

    logger.info(
      { callSid: CallSid, status: Status, callType: CallType },
      'Call status update from Exotel'
    );

    res.status(200).json({ success: true });
  });

  return router;
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');

  if (digits.length >= 10) {
    return `+91${digits.slice(-10)}`;
  }

  return phoneNumber;
}

/**
 * Make outbound call via Exotel API
 * Used for callbacks or sending voice messages
 */
export async function makeExotelCall(
  toNumber: string,
  message: string
): Promise<string> {
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;

  if (!apiKey || !apiToken || !accountSid) {
    throw new Error('Exotel credentials not configured');
  }

  try {
    const response = await fetch(
      `https://api.exotel.com/v1/Accounts/${accountSid}/Calls/connect.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: process.env.EXOTEL_PHONE_NUMBER || '04444000000',
          To: toNumber,
          CallerId: process.env.EXOTEL_PHONE_NUMBER || '04444000000',
          Url: `${process.env.EXOTEL_WEBHOOK_URL}/exotel/call-handler`,
        }).toString(),
      }
    );

    const data = await response.json() as any;

    if (!response.ok) {
      throw new Error(`Exotel API error: ${data.RestException?.Message}`);
    }

    logger.info({ callSid: data.Call.Sid, toNumber }, 'Outbound call initiated');

    return data.Call.Sid;
  } catch (error) {
    logger.error({ error, toNumber }, 'Failed to make Exotel call');
    throw error;
  }
}

/**
 * Send call recording request to Exotel
 * Records the call for processing
 */
export function generateExotelCallRecordingUrl(callSid: string): string {
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;

  if (!accountSid) {
    throw new Error('EXOTEL_ACCOUNT_SID not configured');
  }

  return `https://api.exotel.com/v1/Accounts/${accountSid}/Calls/${callSid}/Recordings`;
}

export default createExotelRouter;