import 'package:flutter/material.dart';
import '../services/profile_service.dart';
import '../services/session_service.dart';
import '../theme/app_colors.dart';

/// Senior profile view, read from `GET /api/me` (the registration the user
/// actually submitted). The role comes from the auth session, which is the
/// authority on it.
class SeniorProfileScreen extends StatefulWidget {
  const SeniorProfileScreen({super.key});

  @override
  State<SeniorProfileScreen> createState() => _SeniorProfileScreenState();
}

class _SeniorProfileScreenState extends State<SeniorProfileScreen> {
  static const _address = 'Greater Kailash, New Delhi';

  String _roleLabel = 'Senior Citizen';
  String _name = '';
  String _phone = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final session = SessionService.instance.session;
    if (mounted) {
      setState(() {
        _roleLabel =
            session?.role == 'volunteer' ? 'Volunteer' : 'Senior Citizen';
      });
    }

    MyProfile? profile;
    try {
      profile = await ProfileService.instance.fetchMe();
    } catch (_) {
      // Leave the fields blank rather than showing a placeholder identity.
      return;
    }
    if (!mounted) return;
    setState(() {
      _name = profile?.fullName?.trim() ?? '';
      _phone = profile?.phoneNumber?.trim() ?? '';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: AppBar(
        backgroundColor: AppColors.navyDark,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Colors.white, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'My Profile',
          style: TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 8),
          Center(
            child: CircleAvatar(
              radius: 40,
              backgroundColor: AppColors.senior.withAlpha(32),
              child: Text(
                _initials(_name),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w700,
                  color: AppColors.senior,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              _name.isEmpty ? 'Your profile' : _name,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              _roleLabel,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(height: 24),
          _ProfileField(
            label: 'Phone',
            value: _phone,
            icon: Icons.phone_outlined,
          ),
          const SizedBox(height: 10),
          const _ProfileField(
            label: 'Address',
            value: _address,
            icon: Icons.location_on_outlined,
          ),
          const SizedBox(height: 10),
          _ProfileField(
            label: 'Role',
            value: _roleLabel,
            icon: Icons.verified_user_outlined,
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.cardWhite,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.divider),
            ),
            child: const Text(
              'Profile editing will be available once your account details '
              'are synced from the server.',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    if (name.trim().isEmpty) return '?';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _ProfileField extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _ProfileField({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.accentBlue),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
