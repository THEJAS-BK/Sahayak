import json
import logging
import uuid
from typing import Literal

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, RunContext, function_tool, room_io
from livekit.agents.log import logger
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()

# Topic the app listens on for structured help requests
TOPIC_HELP_REQUEST = "sahayak_request"

# Envelope schema version (see plans/voice-structured-output.md)
PAYLOAD_VERSION = 1

# Help request contract (mirrors backend createSchema Q-01)
HELP_CATEGORY = Literal[
    "grocery_assistance", "medical_assistance", "transport_assistance", "other"
]
HELP_PRIORITY = Literal["normal", "urgent"]

DESCRIPTION_MAX_LEN = 2000


# Define your agent's behavior by extending the Agent class
class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Sahayak, a warm and patient voice assistant for elderly people in "
                "India who need everyday help. Always start the conversation by greeting "
                "the user with: 'Welcome to Sahayak. How can I help you today?'\n"
                "Listen carefully to what the user needs and figure out a request category "
                "from: grocery_assistance, medical_assistance, transport_assistance, other. "
                "Ask for specifics only when needed (briefly, what they need, and whether "
                "it is urgent). For groceries note the items, for medical help note the "
                "symptom, for transport note the destination.\n"
                "Once you are confident about the category and a short description of what "
                "the user needs, call record_help_request with the category, a one- or "
                "two-sentence description, priority ('normal' or 'urgent'), and the typed "
                "extras (items / symptom / destination) when the user mentioned them. Then "
                "reassure the user that a volunteer will be in touch shortly."
            ),
        )

    async def on_enter(self) -> None:
        await self.session.say("Welcome to Sahayak. How can I help you today?")

    @function_tool
    async def record_help_request(
        self,
        ctx: RunContext,
        category: HELP_CATEGORY,
        description: str,
        priority: HELP_PRIORITY = "normal",
        items: list[str] | None = None,
        symptom: str | None = None,
        destination: str | None = None,
    ) -> str:
        """Record a help request once the user's needs are clear.

        Args:
            category: One of 'grocery_assistance', 'medical_assistance',
                'transport_assistance', 'other'.
            description: A one or two sentence summary of what the user needs
                (max 2000 characters).
            priority: 'urgent' when the user says it is urgent (or it clearly
                is), otherwise 'normal'.
            items: For grocery assistance, the items the user needs, if mentioned.
            symptom: For medical assistance, the symptom/health issue, if mentioned.
            destination: For transport assistance, where the user needs to go,
                if mentioned.
        """
        safe_description = (description or "").strip()
        if not safe_description:
            return "I didn't catch what you need. Could you repeat that, please?"
        if len(safe_description) > DESCRIPTION_MAX_LEN:
            safe_description = safe_description[:DESCRIPTION_MAX_LEN]

        request: dict[str, object] = {
            "category": category,
            "description": safe_description,
            "priority": priority if priority in ("normal", "urgent") else "normal",
        }

        details: dict[str, object] = {}
        if items:
            details["items"] = items
        if symptom:
            details["symptom"] = symptom
        if destination:
            details["destination"] = destination
        if details:
            request["details"] = details

        envelope: dict[str, object] = {
            "v": PAYLOAD_VERSION,
            "type": "help_request",
            "request_id": str(uuid.uuid4()),
            "request": request,
        }

        try:
            room = ctx.session.room_io.room
            await room.local_participant.publish_data(
                json.dumps(envelope).encode("utf-8"),
                topic=TOPIC_HELP_REQUEST,
            )
            logger.info("published help request to app", extra={"payload": envelope})
        except Exception as e:
            logger.warning("failed to publish help request: %s", e)
            return (
                "I'm sorry, but I wasn't able to record your request. "
                "Please try again in a moment."
            )

        return (
            "Thanks, I've noted your request "
            f"for {category.replace('_', ' ')} and a volunteer will be in touch shortly."
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