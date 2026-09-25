import json
import logging

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, function_tool, room_io
from livekit.agents.log import logger
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()

# Topic the app listens on for structured help requests
TOPIC_HELP_REQUEST = "sahayak_request"

HELP_CATEGORIES = [
    "grocery_assistance",
    "medical_assistance",
    "transport_assistance",
    "other",
]


# Define your agent's behavior by extending the Agent class
class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Sahayak, a warm and patient voice assistant for elderly people in "
                "India who need everyday help. Always start the conversation by greeting "
                "the user with: 'Welcome to Sahayak. How can I help you today?'\n"
                "Listen carefully to what the user needs and figure out a request category "
                f"from {HELP_CATEGORIES}. Ask for specifics only when needed (briefly, what "
                "they need, and whether it is urgent).\n"
                "Once you are confident about the category and a short description of what "
                "the user needs, call record_help_request with the category, a one- or "
                "two-sentence description, priority ('normal' or 'urgent'), and any extra "
                "details the user mentioned. Then reassure the user that a volunteer will "
                "be in touch shortly."
            ),
        )

    async def on_enter(self) -> None:
        await self.session.say("Welcome to Sahayak. How can I help you today?")

    @function_tool
    async def record_help_request(
        self,
        ctx: RunContext,
        category: str,
        description: str,
        priority: str = "normal",
        details: str | None = None,
    ) -> str:
        """Record a help request once the user's needs are clear.

        Args:
            category: One of 'grocery_assistance', 'medical_assistance',
                'transport_assistance', 'other'.
            description: A one or two sentence summary of what the user needs.
            priority: 'normal' or 'urgent'.
            details: Optional extra detail the user mentioned (e.g. items needed,
                symptoms, destination).
        """
        payload: dict[str, object] = {
            "category": category,
            "description": description,
            "priority": priority if priority in ("normal", "urgent") else "normal",
        }
        if details:
            payload["details"] = details

        try:
            room = ctx.session.room_io.room
            await room.local_participant.publish_data(
                json.dumps(payload).encode("utf-8"),
                topic=TOPIC_HELP_REQUEST,
            )
            log_payload = dict(payload)
            logger.info("published help request to app", extra={"payload": log_payload})
        except Exception as e:
            logger.warning("failed to publish help request: %s", e)

        return (
            "Thanks, I've noted your request "
            f"for {category} and a volunteer will be in touch shortly."
        )


server = AgentServer()


# The entrypoint function runs when a participant joins the room
@server.rtc_session()
async def entrypoint(ctx: JobContext):
    # Configure the voice pipeline with STT, LLM, TTS, and VAD providers
    session = AgentSession(
        stt="assemblyai/universal-streaming:en",  # Speech-to-text provider
        llm="openai/gpt-4.1-mini",                # Language model for responses
        tts="cartesia/sonic-3",                   # Text-to-speech voice
        vad=silero.VAD.load(),                    # Voice activity detection
        turn_detection=MultilingualModel(),        # Turn detection
    )

    # Start the session with noise cancellation enabled
    await session.start(
        agent=Assistant(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),  # Background voice cancellation
            ),
        ),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    agents.cli.run_app(server)