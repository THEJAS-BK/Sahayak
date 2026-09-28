import asyncio
import json
import logging
import uuid
from typing import Literal

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    function_tool,
    room_io,
)
from livekit.agents.inference import TurnDetector
from livekit.agents.log import logger
from livekit.plugins import noise_cancellation, silero

load_dotenv()

# Topic the app listens on for structured help requests
TOPIC_HELP_REQUEST = "sahayak_request"

# Topic the app publishes its conversation-language preference on
TOPIC_LANGUAGE = "agent_lang"

# Envelope schema version (see plans/voice-integration.md)
PAYLOAD_VERSION = 1

# Conversation languages the app can switch between (ISO-639-1 codes)
LANGUAGES = ("en", "kn")

# Budget for resolving the conversation language before the greeting: how long
# to wait for the app's participant attribute or data-channel packet. The
# attribute only lands once the agent's room has processed the participant info,
# which is shortly after it joins.
LANGUAGE_GRACE_SECONDS = 4.0

# Help request contract (mirrors backend createSchema Q-01)
HELP_CATEGORY = Literal[
    "grocery_assistance", "medical_assistance", "transport_assistance", "other"
]
HELP_PRIORITY = Literal["normal", "urgent"]

DESCRIPTION_MAX_LEN = 2000


def instructions_for(language: str) -> str:
    """Agent instructions for the current conversation language."""
    if language == "kn":
        return (
            "You are Sahayak, a warm and patient voice assistant for elderly people in "
            "India who need everyday help. Converse in Kannada.\n"
            "Speak mostly in Kannada — simple, clear, respectful language. English is "
            "fine only for an occasional well-known word (like grocery, medicine, taxi); "
            "never switch to long English sentences.\n"
            "Listen carefully to what the user needs (in Kannada or English) and figure "
            "out a request category from: grocery_assistance, medical_assistance, "
            "transport_assistance, other. Ask for specifics only when needed (briefly, "
            "what they need, and whether it is urgent). For groceries note the items, "
            "for medical help note the symptom, for transport note the destination.\n"
            "Once you are confident about the category and a short description of what "
            "the user needs, call record_help_request with the category, a one- or "
            "two-sentence description, priority ('normal' or 'urgent'), and the typed "
            "extras (items / symptom / destination) when the user mentioned them. Write "
            "the description in the language the user spoke. Then reassure the user "
            "that a volunteer will be in touch shortly."
        )
    return (
        "You are Sahayak, a warm and patient voice assistant for elderly people in "
        "India who need everyday help. Always respond in English only — never switch "
        "to another language.\n"
        "Always start the conversation by greeting the user with: 'Welcome to Sahayak. "
        "How can I help you today?'\n"
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
    )


def greeting_for(language: str) -> str:
    if language == "kn":
        return "ಸ್ವಾಗತ. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
    return "Welcome to Sahayak. How can I help you today?"


# Define your agent's behavior by extending the Agent class
class Assistant(Agent):
    def __init__(self, session: AgentSession) -> None:
        super().__init__(instructions=instructions_for("en"))
        # The session is injected rather than read from self.session, because a
        # language packet can arrive before session.start() has run.
        self._session = session
        self.language: str = "en"
        self._language_event = asyncio.Event()
        self._language_lock = asyncio.Lock()

    def set_language(self, language: str) -> None:
        """Record the conversation language the app selected."""
        self.language = language
        self._language_event.set()

    async def apply_language(self, language: str) -> None:
        """Reconfigure speech for the selected language, at any point in the
        session (also safe before the session fully starts).

        Serialized so rapid toggles cannot interleave and leave the TTS on one
        language while the instructions describe another."""
        if language not in LANGUAGES:
            return
        async with self._language_lock:
            self.set_language(language)
            tts = self._session.tts
            if tts is not None:
                # Cartesia Sonic 3 covers 'kn'; takes effect on the next reply.
                tts.update_options(language=language)
            await self.update_instructions(instructions_for(language))

    def _attribute_language(self) -> str | None:
        """Conversation language the app set as a participant attribute.

        The agent is dispatched from the participant's token, so it joins *after*
        the app has connected: a data packet published on connect is dropped, but
        attributes are room state and travel with the participant info. That info
        lands shortly after the agent joins, so this can legitimately return None
        on the first few calls — poll until it shows up or the budget runs out.
        """
        try:
            room = self._session.room_io.room
        except Exception:
            return None
        for participant in room.remote_participants.values():
            language = participant.attributes.get("lang")
            if language in LANGUAGES:
                return language
        return None

    async def _resolve_language(self) -> None:
        """Greet in the language the app asked for, defaulting to English.

        Waits for whichever arrives first: the participant attribute (covers a
        preference set before the agent joined) or a data-channel packet (covers
        a toggle while the call is live)."""
        loop = asyncio.get_running_loop()
        deadline = loop.time() + LANGUAGE_GRACE_SECONDS
        while not self._language_event.is_set():
            language = self._attribute_language()
            if language is not None:
                await self.apply_language(language)
                return
            remaining = deadline - loop.time()
            if remaining <= 0:
                break
            try:
                # Wake immediately on a data packet, otherwise re-poll for the
                # attribute.
                await asyncio.wait_for(
                    self._language_event.wait(), timeout=min(remaining, 0.1)
                )
            except asyncio.TimeoutError:
                pass
        await self.apply_language(self.language)

    async def on_enter(self) -> None:
        await self._resolve_language()
        await self.session.say(greeting_for(self.language))

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
            if self.language == "kn":
                return "ನಿಮ್ಮ ಅಗತ್ಯ ನನಗೆ ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಬಹುದೇ?"
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
            if self.language == "kn":
                return (
                    "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ದಾಖಲಿಸಲು ಆಗಲಿಲ್ಲ. "
                    "ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
                )
            return (
                "I'm sorry, but I wasn't able to record your request. "
                "Please try again in a moment."
            )

        if self.language == "kn":
            return (
                "ಧನ್ಯವಾದ. ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ದಾಖಲಿಸಿದ್ದೇನೆ. "
                "ಸ್ವಯಂಸೇವಕರು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ."
            )
        return (
            "Thanks, I've noted your request "
            f"for {category.replace('_', ' ')} and a volunteer will be in touch shortly."
        )


server = AgentServer()


# The entrypoint function runs when a participant joins the room
@server.rtc_session()
async def entrypoint(ctx: JobContext):
    # Configure the voice pipeline with STT, LLM, TTS, and VAD providers.
    # Google Gemini live transcribe auto-detects English and Kannada (and
    # code-switching between them), so the same STT serves both toggle states.
    session = AgentSession(
        stt="google/gemini-3.5-transcribe-live",  # Speech-to-text (auto-detect en/kn)
        llm="openai/gpt-4.1-mini",                # Language model for responses
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",  # Text-to-speech voice
        vad=silero.VAD.load(),                    # Voice activity detection
        turn_detection=TurnDetector(),              # Turn detection
    )

    agent = Assistant(session)

    # Strong references to in-flight language switches, so a task is not
    # garbage collected midway through updating the instructions.
    pending: set[asyncio.Task[None]] = set()

    def _on_data(data_packet) -> None:
        if getattr(data_packet, "topic", None) != TOPIC_LANGUAGE:
            return
        try:
            payload = json.loads(data_packet.data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return
        if not isinstance(payload, dict) or payload.get("v") != PAYLOAD_VERSION:
            return
        language = payload.get("lang")
        if language not in LANGUAGES:
            return
        logger.info("app selected conversation language: %s", language)

        def _done(task: asyncio.Task[None]) -> None:
            pending.discard(task)
            error = None if task.cancelled() else task.exception()
            if error is not None:
                logger.warning("failed to apply conversation language: %s", error)

        task = asyncio.create_task(agent.apply_language(language))
        pending.add(task)
        task.add_done_callback(_done)

    ctx.room.on("data_received", _on_data)

    # Start the session with noise cancellation enabled
    await session.start(
        agent=agent,
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