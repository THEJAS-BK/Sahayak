import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'otp_screen.dart';

/// Combines the "Create Account / Login" and "Enter Email" pages from the
/// diagram into one screen, since both paths collect the same email input.
class LoginEmailScreen extends StatefulWidget {
  const LoginEmailScreen({super.key});

  @override
  State<LoginEmailScreen> createState() => _LoginEmailScreenState();
}

class _LoginEmailScreenState extends State<LoginEmailScreen> {
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
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Sahayak',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(height: 8),
              const Text('Create an account or log in with your email'),
              const SizedBox(height: 32),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
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
