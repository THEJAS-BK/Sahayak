import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/registration_service.dart';
import '../services/session_service.dart';
import '../theme/app_theme.dart';
import '../widgets/primary_button.dart';
import 'registration_submitted_screen.dart';
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
        // No role yet. `role` is only written when police approve a
        // verification, so it stays null for the whole pending window — which
        // means an empty role covers both a brand-new account and one whose
        // registration is still being reviewed. Ask which it is, or a pending
        // user is sent back into registration and dead-ends on a 409.
        await _routeUnassigned();
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

  /// Sends a signed-in user with no role to either the pending-status screen or
  /// role selection. Falls back to role selection when the lookup fails, since
  /// that is the only branch that can still make progress.
  Future<void> _routeUnassigned() async {
    if (mounted) setState(() => _isVerifying = false);

    UserRole? pendingRole;
    try {
      final verification = await RegistrationService.instance.myVerification();
      if (verification != null) {
        pendingRole = switch (verification.role) {
          'volunteer' => UserRole.volunteer,
          'senior' => UserRole.senior,
          _ => null,
        };
      }
    } catch (_) {
      // Treat an unreachable or unauthorised API as "no verification known".
    }
    if (!mounted) return;

    if (pendingRole != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => RegistrationSubmittedScreen(role: pendingRole!),
        ),
      );
      return;
    }

    // Brand-new account, or a REJECTED one that may re-register — choose a role
    // and fill in the form.
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const RoleSelectionScreen()),
    );
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
