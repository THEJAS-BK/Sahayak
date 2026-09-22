import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'enter_email_screen.dart';

/// "Create Account / Login Page" — the first screen the user sees when not
/// already logged in. Matches the top of the Sahayak Mobile App page-flow
/// diagram (the purple "Create Account / Login Page (Two options)" node).
class CreateLoginScreen extends StatelessWidget {
  const CreateLoginScreen({super.key});

  void _goToEmail(BuildContext context, {required bool isNewUser}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => EnterEmailScreen(isNewUser: isNewUser),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // App logo / name
              const Text(
                'Sahayak',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Mobile App & Police Web Portal',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 60),

              PrimaryButton(
                label: 'Create Account',
                color: AppTheme.primary,
                onPressed: () => _goToEmail(context, isNewUser: true),
              ),
              const SizedBox(height: 16),
              PrimaryButton(
                label: 'Log In',
                color: AppTheme.postRegistration,
                onPressed: () => _goToEmail(context, isNewUser: false),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
