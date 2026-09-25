import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/session_service.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'role_selection_screen.dart';
import 'senior_home_screen.dart';
import 'volunteer_home_screen.dart';

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
          : {};
      await SessionService.instance.save(Session(
        accessToken: (data['access_token'] ?? '').toString(),
        refreshToken: (data['refresh_token'] ?? '').toString().isEmpty
            ? null
            : (data['refresh_token'] ?? '').toString(),
        userId: (user['id'] ?? '').toString(),
        role: (user['role'] ?? '').toString(),
        isActive: user['is_active'] as bool? ?? true,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _isVerifying = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
      return;
    } catch (_) {
      if (!mounted) return;
      setState(() => _isVerifying = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text(
                'Could not reach the server. Check your connection and try again.')),
      );
      return;
    }
    if (!mounted) return;
    setState(() => _isVerifying = false);

    final role = SessionService.instance.session?.role;
    if (role == 'senior') {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const SeniorHomeScreen()),
      );
    } else if (role == 'volunteer') {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const VolunteerHomeScreen()),
      );
    } else {
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
