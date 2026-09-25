import readline from 'readline';
import logger from '../utils/logger';
import STTManager from '../stt';
import TTSManager from '../tts';
import LLMManager from '../llm/client';
import ConversationStateManager from '../conversation/state';
import { getBackendClient } from '../backend-client';
import MicrophoneInput from '../audio/microphone';
import SpeakerOutput from '../audio/speaker';
import { SeniorProfile, DialogueTurn } from '../types';

/**
 * Local Demo: Mic → STT → LLM → TTS → Speaker
 * Perfect for testing without Exotel/Twilio
 */
class LocalVoiceDemo {
  private sttManager: STTManager;
  private ttsManager: TTSManager;
  private llmManager: LLMManager;
  private stateManager: ConversationStateManager;
  private backend: any;

  private mic: MicrophoneInput;
  private speaker: SpeakerOutput;

  private isRecording: boolean = false;
  private recordedBuffer: Buffer = Buffer.alloc(0);
  private recordingTimeout: NodeJS.Timeout | null = null;
  private silenceThreshold: number = 500; // ms of silence to trigger STT
  private lastAudioTime: number = 0;

  constructor(seniorProfile: SeniorProfile) {
    this.sttManager = new STTManager();
    this.ttsManager = new TTSManager();
    this.llmManager = new LLMManager();
    this.backend = getBackendClient();

    this.stateManager = new ConversationStateManager('local-demo', seniorProfile);

    this.mic = new MicrophoneInput();
    this.speaker = new SpeakerOutput();

    this.setupMicListeners();

    logger.info(
      { seniorName: seniorProfile.name, language: seniorProfile.preferred_language },
      'Local demo initialized'
    );
  }

  private setupMicListeners(): void {
    this.mic.on('audio', (chunk: Buffer) => {
      if (this.isRecording) {
        this.recordedBuffer = Buffer.concat([this.recordedBuffer, chunk]);
        this.lastAudioTime = Date.now();

        // Reset timeout on each audio chunk
        if (this.recordingTimeout) {
          clearTimeout(this.recordingTimeout);
        }

        // Set timeout to end recording on silence
        this.recordingTimeout = setTimeout(() => {
          this.endRecording();
        }, this.silenceThreshold);
      }
    });

    this.mic.on('error', (error) => {
      logger.error({ error }, 'Microphone error');
    });
  }

  /**
   * Start the demo
   */
  async start(): Promise<void> {
    console.log('\n═══════════════════════════════════════');
    console.log('🎤 Sahayak Local Voice Demo Started');
    console.log('═══════════════════════════════════════\n');

    const profile = this.stateManager.getSeniorProfile();

    // Generate and play greeting
    const greeting = this.buildGreeting(profile);
    this.stateManager.addTurn('assistant', greeting);

    console.log(`\n🎙️  Sahayak: ${greeting}\n`);

    const greetingAudio = await this.ttsManager.synthesize(
      greeting,
      profile.preferred_language
    );

    await this.speaker.play(greetingAudio);

    // Start conversation loop
    await this.conversationLoop();
  }

  /**
   * Main conversation loop
   */
  private async conversationLoop(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askUser = (): Promise<void> => {
      return new Promise((resolve) => {
        rl.question('\n📱 You (type or press ENTER to use mic): ', async (input) => {
          if (input.toLowerCase() === 'exit') {
            console.log('\n👋 Ending demo...\n');
            await this.endDemo();
            rl.close();
            resolve();
            return;
          }

          let userTranscript: string;

          if (input.trim()) {
            // User typed something
            userTranscript = input.trim();
            console.log(`📝 Transcript: ${userTranscript}`);
          } else {
            // Use microphone
            console.log('\n🎤 Listening... (speak now, silent for 1 second to submit)');
            userTranscript = await this.recordFromMic();
          }

          if (!userTranscript) {
            console.log('❌ No input received');
            resolve();
            return;
          }

          // Process turn
          await this.processTurn(userTranscript);

          // Check if conversation ended
          if (!this.stateManager.getState().turns.includes) {
            resolve();
            return;
          }

          // Continue loop
          resolve();
          await askUser();
        });
      });
    };

    await askUser();
  }

  /**
   * Record from microphone until silence
   */
  private async recordFromMic(): Promise<string> {
    return new Promise((resolve) => {
      this.recordedBuffer = Buffer.alloc(0);
      this.isRecording = true;
      this.lastAudioTime = Date.now();

      this.mic.start();

      // Timeout after 10 seconds max
      const maxRecordTimeout = setTimeout(() => {
        this.mic.stop();
        this.isRecording = false;

        if (this.recordedBuffer.length === 0) {
          console.log('⏱️  Recording timeout (no audio captured)');
          resolve('');
        } else {
          this.transcribeBuffer().then(resolve);
        }
      }, 10000);

      // Override the timeout callback to resolve
      const originalEnd = this.endRecording.bind(this);
      this.endRecording = () => {
        clearTimeout(maxRecordTimeout);
        originalEnd();
        this.transcribeBuffer().then(resolve);
      };
    });
  }

  /**
   * Transcribe recorded buffer
   */
  private async transcribeBuffer(): Promise<string> {
    try {
      logger.debug({ bufferSize: this.recordedBuffer.length }, 'Running STT on recorded audio');

      const profile = this.stateManager.getSeniorProfile();
      const result = await this.sttManager.transcribe(
        this.recordedBuffer,
        profile.preferred_language
      );

      console.log(`📝 Transcript: ${result.text} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);

      return result.text;
    } catch (error) {
      logger.error({ error }, 'STT failed');
      console.log('❌ Transcription failed');
      return '';
    }
  }

  /**
   * End recording
   */
  private endRecording(): void {
    if (this.isRecording) {
      this.mic.stop();
      this.isRecording = false;

      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
      }

      logger.info({ bufferSize: this.recordedBuffer.length }, 'Recording ended');
    }
  }

  /**
   * Process a conversation turn
   */
  private async processTurn(userTranscript: string): Promise<void> {
    try {
      const profile = this.stateManager.getSeniorProfile();

      // Add user turn
      this.stateManager.addTurn('user', userTranscript);

      // Generate response
      console.log('\n⏳ Sahayak is thinking...');

      const systemPrompt = `You are Sahayak, a compassionate voice assistant for elderly people in rural Karnataka.
Keep responses SHORT (1-2 sentences max).
Ask clarifying questions if needed.
When you have enough info about what they need, say you're ending the call and help is coming.`;

      const turns = this.stateManager.getRecentTurns(6);

      let assistantResponse = '';

      for await (const chunk of this.llmManager.generateDialogueStream(
        turns,
        systemPrompt
      )) {
        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
        }
      }

      assistantResponse = assistantResponse.trim();

      if (!assistantResponse) {
        console.log('❌ No response generated');
        return;
      }

      console.log(`\n🎙️  Sahayak: ${assistantResponse}`);

      // Add assistant turn
      this.stateManager.addTurn('assistant', assistantResponse);

      // Synthesize and play response
      console.log('🔊 Playing response...');

      const audioBuffer = await this.ttsManager.synthesize(
        assistantResponse,
        profile.preferred_language
      );

      await this.speaker.play(audioBuffer);

      // Check if should extract request (simple heuristic)
      const turnCount = this.stateManager.getState().turns.length / 2;

      if (turnCount >= 4) {
        console.log('\n✅ Extracting request from conversation...');

        const transcript = this.stateManager.getTranscript();
        const extraction = await this.llmManager.extractRequest(transcript);

        console.log(`
📋 EXTRACTED REQUEST:
  - Requirement: ${extraction.requirement_type}
  - Details: ${extraction.detail}
  - Priority: ${extraction.priority}
  - Location: ${this.stateManager.extractLocation()}
`);

        // Submit to backend
        await this.submitRequest(extraction);

        console.log('\n✅ Demo complete! Request submitted to backend.\n');
        process.exit(0);
      }
    } catch (error) {
      logger.error({ error }, 'Turn processing failed');
      console.log('❌ Error processing turn');
    }
  }

  /**
   * Submit request to backend
   */
  private async submitRequest(extraction: any): Promise<void> {
    try {
      const profile = this.stateManager.getSeniorProfile();
      const location = this.stateManager.extractLocation();

      const requestPayload = {
        senior_id: profile.senior_id,
        requirement_type: extraction.requirement_type,
        detail: `${extraction.detail} | Location: ${location}`,
        priority: extraction.priority,
        source: 'local_demo' as any,
      };

      logger.info({ requestPayload }, 'Submitting request to backend');

      // This will fail if backend isn't running, but that's OK for demo
      try {
        await this.backend.createRequest(requestPayload);
        console.log('✅ Request submitted to backend successfully!');
      } catch (backendError) {
        console.log('⚠️  Backend not reachable (is it running on localhost:3000?)');
        console.log(`Request would have been: ${JSON.stringify(requestPayload, null, 2)}`);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to submit request');
    }
  }

  /**
   * End demo
   */
  private async endDemo(): Promise<void> {
    this.mic.stop();

    console.log('\n═══════════════════════════════════════');
    console.log('📊 Demo Summary:');
    console.log('═══════════════════════════════════════');

    const state = this.stateManager.getState();

    console.log(`Total turns: ${state.turns.length}`);
    console.log(`Conversation transcript:`);
    console.log(this.stateManager.getTranscript());

    console.log('\n✅ Demo ended\n');
  }

  private buildGreeting(profile: SeniorProfile): string {
    const name = profile.name.split(' ')[0];
    const greetings: Record<string, string> = {
      kannada: `ನಮಸ್ಕಾರ ${name}! ನಾನು ಸಹಾಯಕ. ನಿಮಗೆ ಏನು ಸಹಾಯ ಬೇಕು?`,
      tulu: `ಸ್ವಾಗತ ${name}! ನಾನು ಸಹಾಯಕ. ನಿಮಗೆ ಏನು ಆಗಿದೆ?`,
      english: `Hello ${name}, I'm Sahayak. How can I help you today?`,
    };

    return greetings[profile.preferred_language] || greetings.kannada;
  }
}

/**
 * Run demo with test senior
 */
async function runDemo(): Promise<void> {
  // Test senior profile (you'll need this in your backend)
  const testSenior: SeniorProfile = {
    senior_id: 'test-senior-001',
    phone_number: '+919999999999',
    name: 'Grandma Lakshmi',
    preferred_language: 'kannada',
    standing_medications: ['Blood pressure medication'],
    medical_conditions: ['Hypertension'],
  };

  const demo = new LocalVoiceDemo(testSenior);

  try {
    await demo.start();
  } catch (error) {
    logger.error({ error }, 'Demo failed');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runDemo();
}

export { LocalVoiceDemo };