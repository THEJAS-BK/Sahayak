import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
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
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _aadhaarController = TextEditingController();
  final _clubIdController = TextEditingController(); // optional

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
        builder: (_) =>
            const RegistrationSubmittedScreen(role: UserRole.volunteer),
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _aadhaarController.dispose();
    _clubIdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Volunteer Registration')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: ListView(
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Full Name'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone Number'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _aadhaarController,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(labelText: 'Aadhaar Card Number'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _clubIdController,
              decoration:
                  const InputDecoration(labelText: 'Club ID (optional)'),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              label: 'Submit for verification',
              color: AppTheme.volunteer,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
