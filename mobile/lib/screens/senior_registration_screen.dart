import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/registration_service.dart';
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
  final _latController      = TextEditingController();
  final _lngController      = TextEditingController();

  String _language = 'kannada';
  bool _submitting = false;

  static const _languages = {
    'kannada': 'Kannada',
    'english': 'English',
    'tulu': 'Tulu',
  };

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final aadhaar = _aadhaarController.text.replaceAll(RegExp(r'\s'), '');
    final lat = double.tryParse(_latController.text.trim());
    final lng = double.tryParse(_lngController.text.trim());

    if (name.isEmpty || phone.isEmpty || aadhaar.length != 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Fill in name, phone and the 12-digit Aadhaar number')),
      );
      return;
    }
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid home latitude and longitude')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      await RegistrationService.instance.submitSenior(
        fullName: name,
        phoneNumber: phone,
        aadhaarNumber: aadhaar,
        latitude: lat,
        longitude: lng,
        language: _language,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const RegistrationSubmittedScreen(role: UserRole.senior),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not submit: ${e.message}')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not reach the server.')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _aadhaarController.dispose();
    _latController.dispose();
    _lngController.dispose();
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

          const SizedBox(height: 16),

          // ── Home location section ──────────────────────────────────
          _SectionCard(
            title: 'Home Location',
            icon: Icons.place_outlined,
            iconColor: AppColors.senior,
            children: [
              const Text(
                'Volunteers are matched using this location, and it is used as '
                'the pickup point for every request you make.',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _FormField(
                      controller: _latController,
                      label: 'Latitude',
                      icon: Icons.explore_outlined,
                      inputType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _FormField(
                      controller: _lngController,
                      label: 'Longitude',
                      icon: Icons.explore_outlined,
                      inputType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                    ),
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 16),

          // ── Language section ───────────────────────────────────────
          _SectionCard(
            title: 'Preferred Language',
            icon: Icons.translate_rounded,
            iconColor: AppColors.accentBlue,
            children: [
              Wrap(
                spacing: 8,
                children: _languages.entries
                    .map((e) => ChoiceChip(
                          label: Text(e.value),
                          selected: _language == e.key,
                          onSelected: (_) => setState(() => _language = e.key),
                        ))
                    .toList(),
              ),
            ],
          ),

          const SizedBox(height: 24),

          PrimaryButton(
            label: _submitting ? 'Submitting...' : 'Submit for Verification',
            color: AppColors.senior,
            icon: Icons.send_outlined,
            onPressed: _submitting ? null : _submit,
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
