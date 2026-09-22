import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'otp_screen.dart';

/// "Enter Email Page" — shared by both sign-up and login flows.
/// Matches the grey "Enter Email Page (For both sign up & login)" node
/// in the Sahayak Mobile App page-flow diagram.
class EnterEmailScreen extends StatefulWidget {
  /// Whether the user arrived via "Create Account" (true) or "Log In" (false).
  final bool isNewUser;

  const EnterEmailScreen({super.key, required this.isNewUser});

  @override
  State<EnterEmailScreen> createState() => _EnterEmailScreenState();
}

class _EnterEmailScreenState extends State<EnterEmailScreen> {
  final _emailController = TextEditingController();
  bool _isSubmitting = false;

  Future<void> _continue() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid email address')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    // TODO: call backend to send OTP to `email`.
    await Future.delayed(const Duration(milliseconds: 400));
    setState(() => _isSubmitting = false);

    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => OtpScreen(email: email)),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                widget.isNewUser ? 'Create your account' : 'Welcome back',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text('Enter your email to receive a one-time code.'),
              const SizedBox(height: 32),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Email address',
                  hintText: 'you@example.com',
                ),
              ),
              const SizedBox(height: 24),
              PrimaryButton(
                label: _isSubmitting ? 'Sending code...' : 'Continue',
                onPressed: _isSubmitting ? null : _continue,
                color: AppTheme.primary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
