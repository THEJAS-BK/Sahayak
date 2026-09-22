import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'agent_conversation_screen.dart';
import 'create_login_screen.dart';

class SeniorHomeScreen extends StatelessWidget {
  const SeniorHomeScreen({super.key});

  void _logout(BuildContext context) {
    // TODO: clear session/token before navigating away.
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CreateLoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Senior Home')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              GestureDetector(
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const AgentConversationScreen(),
                  ),
                ),
                child: Container(
                  width: 140,
                  height: 140,
                  decoration: const BoxDecoration(
                    color: AppTheme.senior,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.mic, color: Colors.white, size: 56),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Click to Speak',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              PrimaryButton(
                label: 'Log out',
                onPressed: () => _logout(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
