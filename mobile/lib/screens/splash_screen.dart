import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../services/registration_service.dart';
import '../services/session_service.dart';
import 'create_login_screen.dart';
import 'registration_submitted_screen.dart';
import 'volunteer_home_screen.dart';
import 'senior_home_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _scale = Tween<double>(begin: 0.92, end: 1.08).animate(
      CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _route());
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _route() async {
    // Brief branded pause so the splash is visible.
    await Future.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;

    // The real backend session is the only thing that can authorise a
    // dashboard. UserSession (SharedPreferences) deliberately holds no token
    // and is cleared independently, so it must not be able to route anyone: a
    // stale marker used to drop a user with no credentials onto a live
    // dashboard, where every call then 401'd with no way back to login.
    final session = await SessionService.instance.restore();
    if (!mounted) return;

    // No access token at all — nothing downstream can be authenticated.
    if (session == null || session.accessToken.isEmpty) {
      _go(const CreateLoginScreen());
      return;
    }

    final role = session.role;
    // A role without an active account is not a usable session: BR-01 blocks
    // every protected route, so the dashboard would load and then 403. The
    // cached role can also predate a decision (approved, or rejected) taken
    // while the app was closed, so trust `isActive` and let the pending screen
    // below find out which it was.
    if (session.isActive && role == 'volunteer') {
      _go(const VolunteerHomeScreen());
      return;
    }
    if (session.isActive && role == 'senior') {
      _go(const SeniorHomeScreen());
      return;
    }

    // Signed in but no role: either a registration is still being reviewed, or
    // it was approved while the app was closed and the cached session predates
    // it. The pending screen polls and continues on approval, so send them
    // there rather than into a second registration that would 409.
    final pending = await _pendingRole();
    if (!mounted) return;
    _go(pending == null
        ? const CreateLoginScreen()
        : RegistrationSubmittedScreen(role: pending));
  }

  /// The role of an in-flight registration, or null if there is none we can see.
  Future<UserRole?> _pendingRole() async {
    try {
      final verification = await RegistrationService.instance.myVerification();
      return switch (verification?.role) {
        'volunteer' => UserRole.volunteer,
        'senior' => UserRole.senior,
        _ => null,
      };
    } catch (_) {
      return null;
    }
  }

  void _go(Widget destination) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => destination),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.navyDark,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: _scale,
              child: const Icon(
                Icons.shield,
                color: AppColors.accentBlue,
                size: 80,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Sahayak',
              style: TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Senior Citizen & Volunteer App',
              style: TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 13,
                fontWeight: FontWeight.w400,
              ),
            ),
            const SizedBox(height: 48),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: AppColors.accentBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
