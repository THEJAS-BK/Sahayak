import { Router, Request, Response } from 'express';
import logger from '../utils/logger';

/**
 * Create Exotel call handler routes
 * Generates Exotel Response Language (ExML) for call flow
 */
export function createExotelCallHandlerRouter(): Router {
  const router = Router();

  /**
   * GET /exotel/call-handler
   * Exotel calls this during active call to get voice flow instructions
   * Responds with ExML (Exotel XML) format
   */
  router.get('/call-handler', (req: Request, res: Response) => {
    const { CallSid, From, CallStatus } = req.query;

    logger.info(
      { callSid: CallSid, from: From, callStatus: CallStatus },
      'Exotel call handler invoked'
    );

    // Generate ExML response that tells Exotel what to do with the call
    const exmlResponse = generateGreetingExML();

    res.type('application/xml');
    res.send(exmlResponse);
  });

  /**
   * POST /exotel/recording-completed
   * Exotel notifies us when call recording is ready
   */
  router.post('/recording-completed', (req: Request, res: Response) => {
    const { CallSid, RecordingUrl } = req.body as any;

    logger.info(
      { callSid: CallSid, recordingUrl: RecordingUrl },
      'Call recording completed'
    );

    // In a full implementation, you'd:
    // 1. Download the recording from RecordingUrl
    // 2. Run STT on it
    // 3. Process through LLM
    // 4. Generate response
    // 5. Play response back or callback

    res.status(200).json({ success: true });
  });

  return router;
}

/**
 * Generate ExML for greeting
 * This is the voice flow Exotel will execute
 */
function generateGreetingExML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Welcome to Sahayak. How can we help you today?</Say>
      <Record maxLength="60" action="/exotel/recording-completed" />
    </Response>`;
}

/**
 * Generate ExML for playing a message
 */
export function generatePlaybackExML(text: string): string {
  const escapedText = escapeXml(text);

  return `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>${escapedText}</Say>
    </Response>`;
}

/**
 * Escape text for XML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default createExotelCallHandlerRouter;