import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../services/user_session.dart';
import '../services/session_service.dart';
import 'create_login_screen.dart';
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

    // Prefer the real backend session if one is stored.
    final session = await SessionService.instance.restore();
    final role = session?.role;

    if (!mounted) return;

    Widget destination;
    if (role == 'volunteer') {
      destination = const VolunteerHomeScreen();
    } else if (role == 'senior') {
      destination = const SeniorHomeScreen();
    } else {
      // Dev fallback — local session marker set by the registration flow.
      final savedRole = await UserSession.getSavedRole();
      if (!mounted) return;
      if (savedRole == 'volunteer') {
        destination = const VolunteerHomeScreen();
      } else if (savedRole == 'senior') {
        destination = const SeniorHomeScreen();
      } else {
        // First-time user — go through the full auth + registration flow.
        destination = const CreateLoginScreen();
      }
    }

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
