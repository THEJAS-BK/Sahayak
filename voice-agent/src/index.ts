import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import dotenv from 'dotenv';
import logger from './utils/logger';
import createExotelRouter, { formatPhoneNumber } from './telephony/exotel';
import createExotelCallHandlerRouter from './telephony/exotel-call-handler';
import ConversationCore from './conversation/core';
import VoiceConversationPipeline from './pipeline/stt-tts-pipeline';
import { getBackendClient } from './backend-client';
import { BackendError } from './utils/errors';

// Load environment variables
dotenv.config();

const app: Express = express();
const httpServer: HTTPServer = createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active conversations
interface ActiveCall {
  conversation: ConversationCore;
  pipeline: VoiceConversationPipeline;
  phoneNumber: string;
  startTime: number;
  recordingUrl?: string;
}

const activeConversations = new Map<string, ActiveCall>();
const backend = getBackendClient();

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'sahayak-voice-agent',
    uptime: process.uptime(),
    activeCalls: activeConversations.size,
    provider: 'exotel',
  });
});

/**
 * Exotel incoming call handler
 */
app.use(
  '/exotel',
  createExotelRouter(async (phoneNumber: string, callSid: string) => {
    logger.info(
      { phoneNumber: formatPhoneNumber(phoneNumber), callSid },
      'Processing incoming call from Exotel'
    );

    try {
      // Look up senior by phone
      const seniorProfile = await backend.lookupSeniorByPhone(phoneNumber);

      logger.info(
        { seniorId: seniorProfile.senior_id, seniorName: seniorProfile.name },
        'Senior found'
      );

      // Create conversation core
      const conversation = new ConversationCore(callSid, seniorProfile, {
        maxTurns: 20,
        maxCallDuration: 300,
        locationPromptTrigger: 3,
      });

      // Create voice pipeline
      const pipeline = new VoiceConversationPipeline(seniorProfile);

      // Store active call
      activeConversations.set(callSid, {
        conversation,
        pipeline,
        phoneNumber,
        startTime: Date.now(),
      });

      logger.info({ callSid }, 'Call state created for Exotel');

      // Setup conversation event listeners
      conversation.on('call-ended', (data) => {
        logger.info(
          { callSid, reason: data.reason, duration: data.duration },
          'Exotel call ended'
        );
        activeConversations.delete(callSid);
      });

      pipeline.on('error', (error) => {
        logger.error({ error, callSid }, 'Pipeline error');
      });
    } catch (error) {
      if (error instanceof BackendError && error.statusCode === 404) {
        logger.warn(
          { phoneNumber: formatPhoneNumber(phoneNumber) },
          'Senior not registered'
        );
      } else {
        logger.error({ error, phoneNumber }, 'Failed to handle incoming call');
      }
    }
  })
);

/**
 * Exotel call handler (voice flow)
 */
app.use('/exotel', createExotelCallHandlerRouter());

/**
 * Debug endpoint: view active calls
 */
app.get('/api/calls/active', (req: Request, res: Response) => {
  const calls = Array.from(activeConversations.entries()).map(([callSid, state]) => ({
    callSid,
    phoneNumber: formatPhoneNumber(state.phoneNumber),
    seniorId: state.conversation.getState().seniorProfile.senior_id,
    seniorName: state.conversation.getState().seniorProfile.name,
    duration: Math.floor((Date.now() - state.startTime) / 1000),
    language: state.conversation.getState().seniorProfile.preferred_language,
  }));

  res.json({
    activeCalls: calls.length,
    calls,
    provider: 'exotel',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Debug endpoint: system info
 */
app.get('/api/system/info', (req: Request, res: Response) => {
  res.json({
    service: 'sahayak-voice-agent',
    provider: 'exotel',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeConversations: activeConversations.size,
    nodeVersion: process.version,
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    availableEndpoints: [
      'GET /health',
      'GET /api/calls/active',
      'GET /api/system/info',
      'POST /exotel/incoming-call (Exotel webhook)',
      'GET /exotel/call-handler (Exotel voice flow)',
      'POST /exotel/recording-completed (Exotel callback)',
    ],
  });
});

/**
 * Error handler
 */
app.use(
  (
    err: Error,
    req: Request,
    res: Response,
    next: (err?: Error) => void
  ) => {
    logger.error({ error: err, path: req.path }, 'Unhandled error');
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
);

/**
 * Start server
 */
const PORT = parseInt(process.env.PORT || '3001', 10);

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, '═══════════════════════════════════════');
  logger.info({ port: PORT }, '🎤 Sahayak Voice Agent Started (Exotel)');
  logger.info({ port: PORT }, '═══════════════════════════════════════');

  logger.info({ exotel: process.env.EXOTEL_PHONE_NUMBER }, 'Exotel configured');
  logger.info({ provider: process.env.LLM_PROVIDER || 'groq' }, 'LLM provider');
  logger.info({ host: `http://localhost:${PORT}` }, 'Health check');
  logger.info(
    { webhook: `${process.env.EXOTEL_WEBHOOK_URL}/exotel/incoming-call` },
    'Exotel webhook URL'
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');

  activeConversations.forEach((data, callSid) => {
    data.conversation.endCall('server_shutdown');
  });

  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});

export { app, httpServer };