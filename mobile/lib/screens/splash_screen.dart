import 'package:flutter/material.dart';
import 'login_email_screen.dart';
import 'role_selection_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  // TODO: replace with a real session check (e.g. flutter_secure_storage
  // token lookup) once backend auth is wired up.
  final bool _isLoggedIn = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _route());
  }

  void _route() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) =>
            _isLoggedIn ? const RoleSelectionScreen() : const LoginEmailScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
