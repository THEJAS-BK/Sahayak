import 'dart:async';

import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/registration_service.dart';
import '../services/user_session.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_badge.dart';
import '../theme/app_colors.dart';
import 'create_login_screen.dart';
import 'volunteer_home_screen.dart';
import 'senior_home_screen.dart';

enum UserRole { volunteer, senior }

/// Waits for the police decision on the submitted registration.
///
/// The status comes from `GET /api/registrations/me` (R-03) — there is no
/// local "approve" shortcut, so the screen reflects exactly what the backend
/// has stored.  Once APPROVED the role is persisted and the user continues to
/// their dashboard; a REJECTED decision shows the officer's reason.
class RegistrationSubmittedScreen extends StatefulWidget {
  final UserRole role;
  const RegistrationSubmittedScreen({super.key, required this.role});

  @override
  State<RegistrationSubmittedScreen> createState() =>
      _RegistrationSubmittedScreenState();
}

class _RegistrationSubmittedScreenState
    extends State<RegistrationSubmittedScreen> {
  static const _pollInterval = Duration(seconds: 3);

  MyVerification? _verification;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(_pollInterval, (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final verification = await RegistrationService.instance.myVerification();
      if (!mounted) return;
      setState(() {
        _verification = verification;
        _error = null;
      });
      if (verification?.isApproved ?? false) {
        _timer?.cancel();
        await _continueToApp();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not reach the server. Retrying…');
    }
  }

  Future<void> _continueToApp() async {
    final messenger = ScaffoldMessenger.of(context);

    // The access token issued at login still carries the pre-approval claims
    // (role null, account inactive), so rotate it before any protected call.
    // ApiClient.refresh() already clears the stored session when it fails.
    final refreshed = await ApiClient.instance.refresh();
    if (!refreshed) {
      if (!mounted) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text('Session expired. Please sign in again.'),
        ));
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const CreateLoginScreen()),
        (route) => false,
      );
      return;
    }

    await UserSession.save(
      role: widget.role == UserRole.volunteer ? 'volunteer' : 'senior',
    );
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => widget.role == UserRole.volunteer
            ? const VolunteerHomeScreen()
            : const SeniorHomeScreen(),
      ),
      (route) => false,
    );
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        content: Text('Approved — welcome to Sahayak'),
        backgroundColor: AppColors.success,
      ));
  }

  VerificationStatus? get _status {
    final v = _verification;
    if (v == null) return null;
    if (v.isApproved) return VerificationStatus.approved;
    if (v.isRejected) return VerificationStatus.rejected;
    return VerificationStatus.pending;
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final approved = status == VerificationStatus.approved;
    final rejected = status == VerificationStatus.rejected;

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
                    color: (approved
                            ? AppColors.success
                            : rejected
                                ? AppColors.error
                                : AppColors.warning)
                        .withAlpha(24),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    approved
                        ? Icons.verified_rounded
                        : rejected
                            ? Icons.cancel_rounded
                            : Icons.hourglass_top_rounded,
                    color: approved
                        ? AppColors.success
                        : rejected
                            ? AppColors.error
                            : AppColors.warning,
                    size: 40,
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // ── Heading ──────────────────────────────────────────────
              Center(
                child: Text(
                  approved
                      ? 'Registration Approved'
                      : rejected
                          ? 'Registration Rejected'
                          : 'Registration Submitted',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              if (status != null)
                Center(child: StatusBadge(status: status)),
              const SizedBox(height: 16),

              // ── Message ──────────────────────────────────────────────
              Center(
                child: Text(
                  rejected
                      ? (_verification?.reviewReason?.isNotEmpty ?? false
                          ? _verification!.reviewReason!
                          : 'The police officer rejected this registration.')
                      : approved
                          ? 'Your account is active.'
                          : 'Awaiting police verification.\n'
                              'You will be notified once approved.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: AppColors.error),
                ),
              ],

              const SizedBox(height: 36),

              // ── Timeline ─────────────────────────────────────────────
              const _TimelineStep(
                index: 1,
                label: 'Registration submitted',
                isDone: true,
              ),
              _TimelineStep(
                index: 2,
                label: 'Police verification in progress',
                isDone: approved || rejected,
              ),
              _TimelineStep(
                index: 3,
                label: rejected ? 'Account rejected' : 'Account activated',
                isDone: approved,
              ),

              const SizedBox(height: 36),

              if (!approved && !rejected)
                Text(
                  'Checking the police portal every ${_pollInterval.inSeconds} seconds…',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              if (approved)
                PrimaryButton(
                  label: 'Continue',
                  color: AppColors.success,
                  onPressed: _continueToApp,
                ),
              if (rejected)
                PrimaryButton(
                  label: 'Check again',
                  color: AppColors.accentBlue,
                  onPressed: _refresh,
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
              color: isDone ? AppColors.success : Colors.transparent,
              border: Border.all(
                color: isDone ? AppColors.success : AppColors.divider,
                width: 2,
              ),
              shape: BoxShape.circle,
            ),
            child: isDone
                ? const Icon(Icons.check, size: 15, color: Colors.white)
                : Center(
                    child: Text(
                      '$index',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isDone ? FontWeight.w600 : FontWeight.w400,
                color: isDone
                    ? AppColors.textPrimary
                    : AppColors.textSecondary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
