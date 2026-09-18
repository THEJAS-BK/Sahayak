import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

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

class _AgentConversationScreenState extends State<AgentConversationScreen> {
  bool _isListening = false;

  void _toggleListening() {
    setState(() => _isListening = !_isListening);
    // TODO: wire up to the voice-agent service API (start/stop stream).
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Talk to Sahayak')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Expanded(
                child: Center(
                  child: Text(
                    'Conversation transcript will appear here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              ),
              GestureDetector(
                onTap: _toggleListening,
                child: CircleAvatar(
                  radius: 44,
                  backgroundColor:
                      _isListening ? AppTheme.postRegistration : AppTheme.senior,
                  child: Icon(
                    _isListening ? Icons.stop : Icons.mic,
                    color: Colors.white,
                    size: 36,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text(_isListening ? 'Listening...' : 'Tap to speak'),
            ],
          ),
        ),
      ),
    );
  }
}
