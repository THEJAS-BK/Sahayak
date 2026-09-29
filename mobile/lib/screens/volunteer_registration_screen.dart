import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../services/api_client.dart';
import '../services/registration_service.dart';
import '../theme/app_colors.dart';
import '../widgets/primary_button.dart';
import 'registration_submitted_screen.dart';

class VolunteerRegistrationScreen extends StatefulWidget {
  const VolunteerRegistrationScreen({super.key});

  @override
  State<VolunteerRegistrationScreen> createState() =>
      _VolunteerRegistrationScreenState();
}

class _VolunteerRegistrationScreenState
    extends State<VolunteerRegistrationScreen> {
  final _nameController    = TextEditingController();
  final _phoneController   = TextEditingController();
  final _aadhaarController = TextEditingController();
  final _organizationController = TextEditingController(); // optional
  final _latController     = TextEditingController(
      text: '${AppConfig.defaultLatitude}');
  final _lngController     = TextEditingController(
      text: '${AppConfig.defaultLongitude}');
  final Set<String> _skills = {};

  bool _submitting = false;

  Future<void> _submit() async {
    if (_submitting) return;

    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final aadhaar = _aadhaarController.text.replaceAll(RegExp(r'\s'), '');
    final lat = double.tryParse(_latController.text.trim());
    final lng = double.tryParse(_lngController.text.trim());

    final problem = RegistrationValidation.problem(
      fullName: name,
      phoneNumber: phone,
      aadhaar: aadhaar,
      latitude: lat,
      longitude: lng,
      latitudeLabel: 'base',
    );
    if (problem != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(problem)));
      return;
    }
    if (_skills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick at least one type of help you can give')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      // Safe: `problem` above already returned for a null or out-of-range
      // coordinate, so the parse succeeded and the range check passed.
      await RegistrationService.instance.submitVolunteer(
        fullName: name,
        phoneNumber: phone,
        aadhaarNumber: aadhaar,
        skills: _skills.toList(),
        latitude: lat!,
        longitude: lng!,
        organization: _organizationController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) =>
              const RegistrationSubmittedScreen(role: UserRole.volunteer),
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
    _organizationController.dispose();
    _latController.dispose();
    _lngController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: AppBar(
        title: const Text('Volunteer Registration'),
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
              color: AppColors.volunteer.withAlpha(20),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.volunteer.withAlpha(60)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.volunteer, size: 18),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your details will be verified by local police before your account is activated.',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.volunteer,
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
            iconColor: AppColors.volunteer,
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

          // ── Club/organisation section ────────────────────────────────
          _SectionCard(
            title: 'Organisation (Optional)',
            icon: Icons.group_outlined,
            iconColor: AppColors.accentBlue,
            children: [
              _FormField(
                controller: _organizationController,
                label: 'Organisation name',
                icon: Icons.numbers_outlined,
                inputType: TextInputType.text,
              ),
            ],
          ),

          const SizedBox(height: 16),

          // ── Skills section ─────────────────────────────────────────
          _SectionCard(
            title: 'What can you help with?',
            icon: Icons.handshake_outlined,
            iconColor: AppColors.volunteer,
            children: [
              const Text(
                'Pick the kinds of requests you want to be dispatched for.',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: helpCategories.entries
                    .map((e) => FilterChip(
                          label: Text(e.value),
                          selected: _skills.contains(e.key),
                          onSelected: (on) => setState(() {
                            if (on) {
                              _skills.add(e.key);
                            } else {
                              _skills.remove(e.key);
                            }
                          }),
                        ))
                    .toList(),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // ── Base location section ──────────────────────────────────
          _SectionCard(
            title: 'Base Location',
            icon: Icons.place_outlined,
            iconColor: AppColors.accentBlue,
            children: [
              const Text(
                'Your base location is the centre of the area you are shown '
                'requests for.',
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

          const SizedBox(height: 24),

          PrimaryButton(
            label: _submitting ? 'Submitting...' : 'Submit for Verification',
            color: AppColors.volunteer,
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
