import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../widgets/primary_button.dart';
import 'enter_email_screen.dart';

/// "Create Account / Login Page" — first screen when the user is not logged in.
/// Styled to match the Sahayak Admin web portal brand.
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
      backgroundColor: AppColors.navyDark,
      body: Column(
        children: [
          // ── Hero header ─────────────────────────────────────────────────
          Expanded(
            flex: 5,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      color: AppColors.accentBlue.withAlpha(30),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.shield,
                      color: AppColors.accentBlue,
                      size: 46,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Sahayak',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 34,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Mobile App & Police Web Portal',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Action card ─────────────────────────────────────────────────
          Expanded(
            flex: 4,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
              decoration: const BoxDecoration(
                color: AppColors.scaffold,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Welcome back',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Sign in or create a new account to continue.',
                    style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 28),
                  PrimaryButton(
                    label: 'Create Account',
                    color: AppColors.accentBlue,
                    icon: Icons.person_add_outlined,
                    onPressed: () => _goToEmail(context, isNewUser: true),
                  ),
                  const SizedBox(height: 12),
                  PrimaryButton(
                    label: 'Log In',
                    color: AppColors.navyDark,
                    icon: Icons.login,
                    onPressed: () => _goToEmail(context, isNewUser: false),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
