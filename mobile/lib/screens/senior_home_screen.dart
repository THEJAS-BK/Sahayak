import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/emergency_service.dart';
import '../services/profile_service.dart';
import '../services/session_service.dart';
import '../services/user_session.dart';
import '../theme/app_colors.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/primary_button.dart';
import 'agent_conversation_screen.dart';
import 'create_login_screen.dart';

class SeniorHomeScreen extends StatefulWidget {
  const SeniorHomeScreen({super.key});

  @override
  State<SeniorHomeScreen> createState() => _SeniorHomeScreenState();
}

class _SeniorHomeScreenState extends State<SeniorHomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _scale;
  bool _sendingSos = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _scale = Tween<double>(begin: 1.0, end: 1.1).animate(
      CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  /// Files a real SOS event (E-01) at the senior's registered home location.
  Future<void> _sendSos() async {
    if (_sendingSos) return;
    setState(() => _sendingSos = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final id = await EmergencyService.instance.triggerSos();
      if (!mounted) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(
            id.isEmpty
                ? 'SOS sent to the police desk.'
                : 'SOS sent to the police desk (ref $id).',
          ),
          backgroundColor: AppColors.error,
        ));
    } on ApiException catch (e) {
      if (!mounted) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('SOS not sent: ${e.message}')));
    } catch (_) {
      if (!mounted) return;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
            const SnackBar(content: Text('SOS not sent. Check your connection.')));
    } finally {
      if (mounted) setState(() => _sendingSos = false);
    }
  }

  /// The app has exactly one request channel: the voice agent.  These tiles
  /// open it instead of pretending to submit a form.
  void _openAgent(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AgentConversationScreen()),
    );
  }

  void _logout(BuildContext context) async {
    await SessionService.instance.clear();
    ProfileService.instance.clearCache();
    await UserSession.clear();
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
      backgroundColor: AppColors.scaffold,
      appBar: const SahayakAppBar(subtitle: 'Senior Citizen Portal'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Status card ─────────────────────────────────────────
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.cardWhite,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.success.withAlpha(24),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.verified_user_outlined,
                        color: AppColors.success,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Account Verified',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Your registration has been approved by local authorities.',
                            style: TextStyle(
                              fontSize: 11,
                              color: AppColors.textSecondary,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // ── Mic CTA ──────────────────────────────────────────────
              Center(
                child: Column(
                  children: [
                    GestureDetector(
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const AgentConversationScreen(),
                        ),
                      ),
                      child: ScaleTransition(
                        scale: _scale,
                        child: Container(
                          width: 148,
                          height: 148,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.senior,
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.senior.withAlpha(100),
                                blurRadius: 28,
                                spreadRadius: 6,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.mic,
                            color: Colors.white,
                            size: 60,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'Tap to Speak',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Say "I need help" to reach a volunteer.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // ── Quick action grid ─────────────────────────────────────
              Row(
                children: [
                  _QuickAction(
                    icon: Icons.emergency_outlined,
                    label: _sendingSos ? 'Sending...' : 'SOS',
                    color: AppColors.error,
                    onTap: _sendingSos ? () {} : _sendSos,
                  ),
                  const SizedBox(width: 10),
                  _QuickAction(
                    icon: Icons.medication_outlined,
                    label: 'Medication',
                    color: AppColors.accentBlue,
                    onTap: () => _openAgent(context),
                  ),
                  const SizedBox(width: 10),
                  _QuickAction(
                    icon: Icons.directions_car_outlined,
                    label: 'Transport',
                    color: AppColors.volunteer,
                    onTap: () => _openAgent(context),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              PrimaryButton(
                label: 'Log out',
                outlined: true,
                color: AppColors.textSecondary,
                onPressed: () => _logout(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: AppColors.cardWhite,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 6),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
