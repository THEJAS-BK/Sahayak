import asyncio
import json
import logging
import uuid
from collections.abc import Sequence
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
    llm,
    room_io,
    stt,
    tts,
)
from livekit.agents import inference
from livekit.agents.inference import TurnDetector
from livekit.plugins import noise_cancellation, silero

load_dotenv()

# A stdlib logger under this module's own name, not livekit.agents.log's: the
# warnings this agent emits (a language switch that could not be applied, a
# request that could not be published) are the only clue that a call went wrong,
# and they should land on whatever handler the worker configures rather than
# being shadowed by the SDK's logger.
logger = logging.getLogger(__name__)


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


def stt_for(language: str) -> stt.STT:
    """STT configured for a conversation language.

    Deepgram Nova-3 is the only LiveKit Inference STT that understands Kannada,
    and its ``multi`` corpus does *not* include it, so the model is pinned to
    the selected language explicitly: ``deepgram/nova-3:kn`` when Kannada is
    active, plain ``deepgram/nova-3`` (English) otherwise.

    Unlike the TTS, the STT's language must be decided before the session opens:
    the recognition stream is long-lived (created once, reused across turns), so
    calling this mid-session alone would not pick up the new language — the swap
    also has to route through the pipelined STT, not just the instance's options.
    """
    if language == "kn":
        return inference.STT.from_model_string("deepgram/nova-3:kn")
    return inference.STT.from_model_string("deepgram/nova-3")


async def _resolve_initial_language(room) -> str:
    """The app's selected conversation language, read before session start.

    The app publishes its choice as the ``lang`` participant attribute, which is
    room state and travels with the participant info — unlike a data packet,
    which is dropped if it is published before the agent joins. That info lands
    shortly after the agent joins, so poll briefly; default to English if it
    never shows up.
    """
    loop = asyncio.get_running_loop()
    deadline = loop.time() + LANGUAGE_GRACE_SECONDS
    while True:
        for participant in room.remote_participants.values():
            language = participant.attributes.get("lang")
            if language in LANGUAGES:
                return language
        remaining = deadline - loop.time()
        if remaining <= 0:
            return "en"
        await asyncio.sleep(min(remaining, 0.1))


def set_tts_language(instances: Sequence[tts.TTS], language: str) -> None:
    """Point every TTS backend at the conversation language.

    Reaches past `tts.FallbackAdapter`, which exposes no `update_options` of its
    own, so the backends have to be handed over as the concrete instances they
    are. Two livekit-agents details make this more than an assignment:

    - `language` only travels in the websocket's `session.create` message, and
      that socket is pooled and reused. The new language is silently dropped
      unless the pooled connection is dropped with it, so a language switch
      that skips this keeps speaking the previous language until the socket is
      recycled on its own (or fails).
    - `_pool` is private. If a future release renames it the switch degrades to
      a logged warning rather than a crash, but the voice will not follow.

    Best-effort by design: never raises, because the model instructions matter
    more than the voice and must not be blocked by a TTS that cannot switch.
    """
    for instance in instances:
        update_options = getattr(instance, "update_options", None)
        if update_options is None:
            logger.warning("TTS %s cannot change language at runtime", instance)
            continue
        try:
            update_options(language=language)
        except Exception as e:
            logger.warning("failed to set TTS %s language: %s", instance, e)
            continue
        pool = getattr(instance, "_pool", None)
        invalidate = getattr(pool, "invalidate", None)
        if invalidate is None:
            logger.warning(
                "TTS %s keeps a pooled connection whose language is now stale; "
                "the voice may not follow the language switch",
                instance,
            )
            continue
        invalidate()


# Define your agent's behavior by extending the Agent class
class Assistant(Agent):
    def __init__(
        self,
        session: AgentSession,
        tts_instances: Sequence[tts.TTS],
        initial_language: str = "en",
    ) -> None:
        super().__init__(instructions=instructions_for("en"))
        # The session is injected rather than read from self.session, because a
        # language packet can arrive before session.start() has run.
        self._session = session
        # The FallbackAdapter's backends, kept as references of our own: the
        # adapter cannot be asked to change language itself.
        self._tts_instances = tts_instances
        self.language: str = initial_language
        self._language_event = asyncio.Event()
        self._language_lock = asyncio.Lock()
        # The STT the session opened with (built from the entry attributes).
        # Tracks the language its stream is actually listening in, so a switch
        # to the same language does not needlessly recreate the stream.
        self._stt_language = initial_language

    def set_language(self, language: str) -> None:
        """Record the conversation language the app selected."""
        self.language = language
        self._language_event.set()

    async def apply_language(self, language: str) -> None:
        """Reconfigure speech for the selected language, at any point in the
        session (also safe before the session fully starts).

        Switches the STT too, not just the TTS: the recognition stream is
        long-lived, so the STT instance's language alone would not take effect;
        routing the swap through the live pipeline recreates the stream with
        the new language.

        Serialized so rapid toggles cannot interleave and leave the TTS on one
        language while the instructions describe another."""
        if language not in LANGUAGES:
            return
        async with self._language_lock:
            self.set_language(language)
            # Cartesia Sonic 3 covers 'kn'; takes effect on the next reply. Kept
            # ahead of the instructions and unable to raise, so a TTS that will
            # not switch still leaves the model speaking the right language.
            set_tts_language(self._tts_instances, language)
            if language != self._stt_language:
                # Deepgram Nova-3 pinned to the selected language, swapped into
                # the running pipeline so the next utterance is heard in that
                # language.
                self.update_options(stt=stt_for(language))
                self._stt_language = language
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
    # Decide the *listening* language before the pipeline starts: the STT stream
    # is long-lived, so it must be built with the language baked in rather than
    # switched after the fact. The worker joins the room asynchronously on
    # session.start, but the app sets its preference as a participant attribute
    # before this agent is dispatched, so connect first, then read it off the
    # room with a short grace period (data packets published before the agent
    # joins are dropped, so they cannot be used here).
    await ctx.connect()
    language = await _resolve_initial_language(ctx.room)
    logger.info("conversation language at entry: %s", language)

    # Configure the voice pipeline with STT, LLM, TTS, and VAD providers.
    # Deepgram Nova-3 is pinned to the conversation language ('kn' when Kannada
    # is selected, English otherwise): it is the only Inference STT that hears
    # Kannada, and its multi corpus does not include it.
    #
    # The TTS backends are built here rather than inline so the agent can keep a
    # reference to each one: switching conversation language means reconfiguring
    # them, and the FallbackAdapter offers no way to reach through to them.
    tts_instances = [
        # Cartesia Sonic 3 covers 'kn'; inworld is the fallback.
        inference.TTS.from_model_string(
            "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"
        ),
        inference.TTS.from_model_string("inworld/inworld-tts-1"),
    ]

    session = AgentSession(
        stt=stt_for(language),  # Speech-to-text in the conversation language
        llm=llm.FallbackAdapter(  # Language model for responses
            [
                inference.LLM(model="openai/gpt-4.1-mini"),
            ]
        ),
        tts=tts.FallbackAdapter(tts_instances),  # Text-to-speech voice
        vad=silero.VAD.load(),  # Voice activity detection
        turn_detection=TurnDetector(),  # Turn detection
    )

    agent = Assistant(session, tts_instances, initial_language=language)

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