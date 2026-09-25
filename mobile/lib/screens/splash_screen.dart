import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/session_service.dart';
import 'create_login_screen.dart';
import 'senior_home_screen.dart';
import 'volunteer_home_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _route());
  }

  Future<void> _route() async {
    await SessionService.instance.restore();

    Widget next = const CreateLoginScreen();
    if (SessionService.instance.session != null) {
      final refreshed = await ApiClient.instance.refresh();
      final role = SessionService.instance.session?.role;
      if (refreshed && role == 'volunteer') {
        next = const VolunteerHomeScreen();
      } else if (refreshed && role == 'senior') {
        next = const SeniorHomeScreen();
      }
    }

    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => next));
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
