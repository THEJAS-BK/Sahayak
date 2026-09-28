import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { BackendError, AuthenticationError } from '../utils/errors';
import {
  ServiceCredential,
  SeniorLookupResponse,
  CreateRequestPayload,
  CreateRequestResponse,
  CreateEmergencyEventPayload,
  CreateEmergencyEventResponse,
} from './types';

export class BackendClient {
  private axiosInstance: AxiosInstance;
  private serviceJwt: string;
  private baseUrl: string;
  private serviceSecret: string;

  constructor() {
    this.baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
    this.serviceSecret = process.env.BACKEND_SERVICE_SECRET || 'dev-secret-key';

    this.axiosInstance = axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Generate service credential JWT on initialization
    this.serviceJwt = this.generateServiceJwt();

    // Add auth interceptor
    this.axiosInstance.interceptors.request.use((config) => {
      config.headers.Authorization = `Bearer ${this.serviceJwt}`;
      return config;
    });

    // Add error interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data || {};
        const message =
          errorData.error || error.message || 'Backend request failed';

        logger.error(
          {
            statusCode,
            error: errorData,
            url: error.config?.url,
          },
          'Backend API error'
        );

        throw new BackendError(message, statusCode, errorData.details);
      }
    );
  }

  /**
   * Generate a new service credential JWT
   * Valid for 1 hour; can be refreshed when needed
   */
  private generateServiceJwt(): string {
    const credential: ServiceCredential = {
      role: 'voice-agent-service',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };

    const token = jwt.sign(credential, this.serviceSecret, {
      algorithm: 'HS256',
    });

    logger.debug('Generated service JWT');
    return token;
  }

  /**
   * Refresh service JWT if expired
   */
  private ensureValidJwt(): void {
    try {
      const decoded = jwt.decode(this.serviceJwt) as ServiceCredential;
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Refresh if less than 5 minutes left
      if (decoded.exp - nowSeconds < 300) {
        this.serviceJwt = this.generateServiceJwt();
      }
    } catch (err) {
      logger.warn('Failed to decode JWT, regenerating');
      this.serviceJwt = this.generateServiceJwt();
    }
  }

  /**
   * Look up a senior by phone number
   * Used during call initiation to greet by name and set language
   */
  async lookupSeniorByPhone(phoneNumber: string): Promise<SeniorLookupResponse> {
    this.ensureValidJwt();

    try {
      const response = await this.axiosInstance.get<SeniorLookupResponse>(
        `/internal/seniors/by-phone/${encodeURIComponent(phoneNumber)}`
      );

      logger.info({ phoneNumber }, 'Senior lookup successful');
      return response.data;
    } catch (error) {
      if (error instanceof BackendError && error.statusCode === 404) {
        logger.warn({ phoneNumber }, 'Senior not found');
        throw new BackendError(
          'Senior not registered with Sahayak',
          404,
          { phoneNumber }
        );
      }
      throw error;
    }
  }

  /**
   * Create a normal request (routine or moderately urgent)
   * Called when conversation concludes with a structured request
   */
  async createRequest(payload: CreateRequestPayload): Promise<CreateRequestResponse> {
    this.ensureValidJwt();

    try {
      const response = await this.axiosInstance.post<CreateRequestResponse>(
        '/requests',
        payload
      );

      logger.info(
        { requestId: response.data.request_id, seniorId: payload.senior_id },
        'Request created'
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create an emergency event
   * Called when distress is detected or LLM classifies as urgent
   * Bypasses volunteer matching; goes straight to police notification
   */
  async createEmergencyEvent(
    payload: CreateEmergencyEventPayload
  ): Promise<CreateEmergencyEventResponse> {
    this.ensureValidJwt();

    try {
      const response = await this.axiosInstance.post<CreateEmergencyEventResponse>(
        '/emergency-events',
        payload
      );

      logger.info(
        {
          emergencyEventId: response.data.emergency_event_id,
          seniorId: payload.senior_id,
          triggeredBy: payload.triggered_by,
        },
        'Emergency event created'
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Health check to confirm backend is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.axiosInstance.get('/health');
      return true;
    } catch (error) {
      logger.warn('Backend health check failed', { error });
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let backendClientInstance: BackendClient | null = null;

export function getBackendClient(): BackendClient {
  if (!backendClientInstance) {
    backendClientInstance = new BackendClient();
  }
  return backendClientInstance;
}

export default BackendClient;