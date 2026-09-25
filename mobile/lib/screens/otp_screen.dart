import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/session_service.dart';
import '../theme/app_theme.dart';
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

    try {
      final data = await ApiClient.instance.post('/api/auth/otp/verify',
          body: {'email': widget.email, 'code': code});

      final user = data['user'] is Map<String, dynamic>
          ? data['user'] as Map<String, dynamic>
          : const <String, dynamic>{};
      final role = (user['role'] as String?) ?? '';
      final accessToken = (data['access_token'] as String?) ?? '';
      final refreshToken = (data['refresh_token'] as String?) ?? '';

      if (accessToken.isEmpty) {
        throw const ApiException(
          code: 'EMPTY_TOKEN',
          message: 'Server did not return a session token',
        );
      }

      await SessionService.instance.save(Session(
        accessToken: accessToken,
        refreshToken: refreshToken.isEmpty ? null : refreshToken,
        userId: (user['id'] as String?) ?? '',
        role: role,
        isActive: (user['is_active'] as bool?) ?? true,
      ));

      if (!mounted) return;
      setState(() => _isVerifying = false);

      if (role == 'volunteer') {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (_) => const VolunteerHomeScreen()),
          (route) => false,
        );
      } else if (role == 'senior') {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(builder: (_) => const SeniorHomeScreen()),
          (route) => false,
        );
      } else {
        // New user (no role yet) → choose volunteer vs senior, then register.
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const RoleSelectionScreen()),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _isVerifying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Verification failed: ${e.message}')),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isVerifying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not verify the code. '
              'Check your connection and try again.')),
        );
      }
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
