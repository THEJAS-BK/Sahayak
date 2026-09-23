import 'package:flutter/material.dart';
import '../services/user_session.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_badge.dart';
import '../theme/app_colors.dart';
import 'volunteer_home_screen.dart';
import 'senior_home_screen.dart';

enum UserRole { volunteer, senior }

class RegistrationSubmittedScreen extends StatelessWidget {
  final UserRole role;
  const RegistrationSubmittedScreen({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Icon ────────────────────────────────────────────────
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.warning.withAlpha(24),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.hourglass_top_rounded,
                    color: AppColors.warning,
                    size: 40,
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // ── Heading ──────────────────────────────────────────────
              const Center(
                child: Text(
                  'Registration Submitted',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              const Center(
                child: StatusBadge(status: VerificationStatus.pending),
              ),
              const SizedBox(height: 16),
              const Center(
                child: Text(
                  'Awaiting police verification.\nYou will be notified once approved.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),

              const SizedBox(height: 36),

              // ── Timeline ─────────────────────────────────────────────
              const _TimelineStep(
                index: 1,
                label: 'Registration submitted',
                isDone: true,
              ),
              const _TimelineStep(
                index: 2,
                label: 'Police verification in progress',
                isDone: false,
              ),
              const _TimelineStep(
                index: 3,
                label: 'Account activated',
                isDone: false,
              ),

              const SizedBox(height: 36),

              // TODO: replace with real status polling / push notification.
              // Button below simulates approval for local dev only.
              PrimaryButton(
                label: 'Simulate approval (dev only)',
                color: AppColors.accentBlue,
                onPressed: () async {
                  // Persist the role so the user won't go through
                  // registration again on future logins.
                  await UserSession.save(
                    role: role == UserRole.volunteer ? 'volunteer' : 'senior',
                  );
                  if (!context.mounted) return;
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(
                      builder: (_) => role == UserRole.volunteer
                          ? const VolunteerHomeScreen()
                          : const SeniorHomeScreen(),
                    ),
                    (route) => false,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimelineStep extends StatelessWidget {
  final int index;
  final String label;
  final bool isDone;

  const _TimelineStep({
    required this.index,
    required this.label,
    required this.isDone,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isDone ? AppColors.success : Colors.transparent,
              border: isDone ? null : Border.all(color: AppColors.divider, width: 2),
            ),
            child: isDone
                ? const Icon(Icons.check, color: Colors.white, size: 14)
                : Center(
                    child: Text(
                      '$index',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: isDone ? FontWeight.w600 : FontWeight.w400,
              color: isDone ? AppColors.textPrimary : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
