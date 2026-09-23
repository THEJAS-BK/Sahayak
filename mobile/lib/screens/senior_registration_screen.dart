import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../widgets/primary_button.dart';
import 'registration_submitted_screen.dart';

class SeniorRegistrationScreen extends StatefulWidget {
  const SeniorRegistrationScreen({super.key});

  @override
  State<SeniorRegistrationScreen> createState() =>
      _SeniorRegistrationScreenState();
}

class _SeniorRegistrationScreenState extends State<SeniorRegistrationScreen> {
  final _nameController     = TextEditingController();
  final _phoneController    = TextEditingController();
  final _aadhaarController  = TextEditingController();

  void _submit() {
    if (_nameController.text.trim().isEmpty ||
        _phoneController.text.trim().isEmpty ||
        _aadhaarController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Fill in name, phone and Aadhaar number')),
      );
      return;
    }

    // TODO: submit form data to backend for police verification.
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => const RegistrationSubmittedScreen(role: UserRole.senior),
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _aadhaarController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: AppBar(
        title: const Text('Senior Citizen Registration'),
        backgroundColor: AppColors.navyDark,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Info banner ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.accentBlue.withAlpha(20),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.accentBlue.withAlpha(60)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.accentBlue, size: 18),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your details will be verified by local police before your account is activated.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.accentBlue,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Personal info section ────────────────────────────────────
          _SectionCard(
            title: 'Personal Information',
            icon: Icons.person_outline,
            iconColor: AppColors.senior,
            children: [
              _FormField(
                controller: _nameController,
                label: 'Full Name',
                icon: Icons.badge_outlined,
                inputType: TextInputType.name,
              ),
              const SizedBox(height: 14),
              _FormField(
                controller: _phoneController,
                label: 'Phone Number',
                icon: Icons.phone_outlined,
                inputType: TextInputType.phone,
              ),
              const SizedBox(height: 14),
              _FormField(
                controller: _aadhaarController,
                label: 'Aadhaar Card Number',
                icon: Icons.credit_card_outlined,
                inputType: TextInputType.number,
              ),
            ],
          ),

          const SizedBox(height: 24),

          PrimaryButton(
            label: 'Submit for Verification',
            color: AppColors.senior,
            icon: Icons.send_outlined,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

// ── Shared form widgets ───────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color iconColor;
  final List<Widget> children;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.iconColor,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: iconColor, size: 18),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    );
  }
}

class _FormField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType inputType;

  const _FormField({
    required this.controller,
    required this.label,
    required this.icon,
    required this.inputType,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: inputType,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 18, color: AppColors.textSecondary),
      ),
    );
  }
}
