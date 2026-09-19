import 'package:flutter/material.dart';
import '../widgets/primary_button.dart';
import 'volunteer_home_screen.dart';
import 'senior_home_screen.dart';

enum UserRole { volunteer, senior }

class RegistrationSubmittedScreen extends StatelessWidget {
  final UserRole role;
  const RegistrationSubmittedScreen({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.hourglass_top, size: 64),
              const SizedBox(height: 16),
              const Text(
                'Registration submitted',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Awaiting police verification. You will be notified once approved.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              // TODO: replace with real status polling / push notification.
              // Button below simulates approval for local dev only.
              PrimaryButton(
                label: 'Simulate verification approved (dev only)',
                onPressed: () => Navigator.pushReplacement(
                  context,
                  MaterialPageRoute(
                    builder: (_) => role == UserRole.volunteer
                        ? const VolunteerHomeScreen()
                        : const SeniorHomeScreen(),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
