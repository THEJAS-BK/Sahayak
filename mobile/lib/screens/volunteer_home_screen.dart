import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/session_service.dart';
import '../theme/app_theme.dart';
import 'create_login_screen.dart';

class VolunteerHomeScreen extends StatelessWidget {
  const VolunteerHomeScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    try {
      await ApiClient.instance.post(
        '/api/auth/logout',
        body: {'refresh_token': SessionService.instance.refreshToken ?? ''},
      );
    } catch (_) {
      // best-effort; still clear the local session
    }
    await SessionService.instance.clear();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CreateLoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Volunteer Home'),
        actions: [
          IconButton(
            icon: const Icon(Icons.account_circle_outlined),
            onPressed: () {}, // TODO: profile screen
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _HomeSection(
            title: 'Requests in your area',
            icon: Icons.location_on_outlined,
            color: AppTheme.volunteer,
          ),
          const SizedBox(height: 12),
          const _HomeSection(
            title: 'Requests you accepted',
            icon: Icons.check_circle_outline,
            color: AppTheme.volunteer,
          ),
          const SizedBox(height: 24),
          TextButton(
            onPressed: () => _logout(context),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}

class _HomeSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;

  const _HomeSection({
    required this.title,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: color),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {}, // TODO: navigate to the relevant list
      ),
    );
  }
}
