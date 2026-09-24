import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/voice_call.dart';

/// Placeholder UI for the voice-based agent conversation.
/// Per the client design doc this flow is "to be finalized" — this screen
/// is a starting point to unblock integration with Vishnu/Shashank's
/// voice-agent service, not a final design.
class AgentConversationScreen extends StatefulWidget {
  const AgentConversationScreen({super.key});

  @override
  State<AgentConversationScreen> createState() =>
      _AgentConversationScreenState();
}

/// One chat bubble on the conversation screen.
class _Message {
  const _Message({required this.text, required this.fromAgent, this.isInterim = false});

  final String text;
  final bool fromAgent;

  /// True while the agent is still speaking; the bubble shows partial text
  /// until a finalised transcript replaces it.
  final bool isInterim;
}

/// Quick-reply options offered right after the agent's greeting.
/// Replace with real agent output later.
const List<String> _agentOptions = [
  'I need groceries',
  'I need medicine',
  'I need help with travel',
  'Something else',
];

class _AgentConversationScreenState extends State<AgentConversationScreen> {
  final ScrollController _scrollController = ScrollController();
  final List<_Message> _messages = [
    const _Message(
      text: 'Welcome to Sahayak. How can I help you today?',
      fromAgent: true,
    ),
  ];
  bool _showOptions = true;

  /// Set once the live agent starts talking; drops the mock greeting/options
  /// so the thread reflects the real conversation only.
  bool _hasLiveTranscript = false;

  void _selectOption(String option) {
    setState(() {
      _showOptions = false;
      _messages.add(_Message(text: option, fromAgent: false));
      _messages.add(const _Message(
        text: 'Okay, tell me a bit more about what you need.',
        fromAgent: true,
      ));
    });
    _scrollToBottom();
  }

  /// Appends the agent's transcription from the voice channel. Interim chunks
  /// render as a live bubble that gets replaced by the finalised text.
  void _onAgentTranscript(String text, bool isFinal) {
    setState(() {
      if (!_hasLiveTranscript) {
        _hasLiveTranscript = true;
        _messages.clear();
        _showOptions = false;
      }

      final idx = _messages.length - 1;
      final lastIsAgentInterim =
          _messages.isNotEmpty && _messages[idx].fromAgent && _messages[idx].isInterim;

      if (isFinal) {
        if (lastIsAgentInterim) {
          _messages[idx] = _Message(text: text, fromAgent: true);
        } else {
          _messages.add(_Message(text: text, fromAgent: true));
        }
      } else if (lastIsAgentInterim) {
        _messages[idx] = _Message(text: text, fromAgent: true, isInterim: true);
      } else {
        _messages.add(_Message(text: text, fromAgent: true, isInterim: true));
      }
    });
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Talk to Sahayak')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  return _MessageBubble(message: _messages[index]);
                },
              ),
            ),
            if (_showOptions) _OptionsPanel(onSelect: _selectOption),
            const Divider(height: 1),
            VoiceCallControl(onTranscript: _onAgentTranscript),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final _Message message;

  @override
  Widget build(BuildContext context) {
    final bool isAgent = message.fromAgent;
    return Align(
      alignment: isAgent ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: isAgent ? Colors.white : AppTheme.senior,
          borderRadius: BorderRadius.circular(16),
          border: isAgent ? Border.all(color: Colors.black12) : null,
        ),
        child: Text(
          message.isInterim && message.fromAgent ? '$message.text…' : message.text,
          style: TextStyle(
            fontSize: 18,
            color: isAgent ? Colors.black87 : Colors.white,
            fontStyle: message.isInterim ? FontStyle.italic : FontStyle.normal,
          ),
        ),
      ),
    );
  }
}

class _OptionsPanel extends StatelessWidget {
  const _OptionsPanel({required this.onSelect});

  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final String option in _agentOptions)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => onSelect(option),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    foregroundColor: AppTheme.senior,
                    side: const BorderSide(color: AppTheme.senior, width: 1.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    textStyle:
                        const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                  child: Text(option),
                ),
              ),
            ),
        ],
      ),
    );
  }
}