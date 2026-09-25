import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/user_session.dart';
import '../widgets/primary_button.dart';
import 'role_selection_screen.dart';
import 'volunteer_home_screen.dart';
import 'senior_home_screen.dart';

class OtpScreen extends StatefulWidget {
  final String email;
  const OtpScreen({super.key, required this.email});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _otpController = TextEditingController();
  bool _isVerifying = false;

  Future<void> _verify() async {
    final code = _otpController.text.trim();
    if (code.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter the 6-digit code')),
      );
      return;
    }

    setState(() => _isVerifying = true);
    // TODO: verify `code` against backend for widget.email.
    await Future.delayed(const Duration(milliseconds: 400));

    // Check if this user has already registered before.
    final savedRole = await UserSession.getSavedRole();

    if (!mounted) return;
    setState(() => _isVerifying = false);

    if (savedRole == 'volunteer') {
      // Returning volunteer → skip role/registration/verification flow.
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const VolunteerHomeScreen()),
        (route) => false,
      );
    } else if (savedRole == 'senior') {
      // Returning senior → skip role/registration/verification flow.
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const SeniorHomeScreen()),
        (route) => false,
      );
    } else {
      // First-time user → go to role selection.
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const RoleSelectionScreen()),
      );
    }
  }

  @override
  void dispose() {
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Enter the code sent to ${widget.email}'),
            const SizedBox(height: 24),
            TextField(
              controller: _otpController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(labelText: '6-digit code'),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              label: _isVerifying ? 'Verifying...' : 'Verify',
              onPressed: _isVerifying ? null : _verify,
              color: AppTheme.primary,
            ),
          ],
        ),
      ),
    );
  }
}
