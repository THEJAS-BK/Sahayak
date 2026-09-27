import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/emergency_service.dart';
import '../services/profile_service.dart';
import '../services/requests_service.dart';
import '../services/session_service.dart';
import '../services/user_session.dart';
import '../theme/app_colors.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_badge.dart';
import 'agent_conversation_screen.dart';
import 'create_login_screen.dart';
import 'my_requests_screen.dart';
import 'senior_my_requests_screen.dart';
import 'senior_profile_screen.dart';
import 'senior_request_detail_screen.dart';

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

  /// The senior's newest request, or null if they have never asked for help.
  /// Drives the "who is helping me" card so the answer to "did somebody
  /// accept?" is on the home screen rather than two taps away.
  HelpRequest? _current;
  bool _loadingRequests = true;

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
    _loadRequests();
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  /// Q-02. A failure here must never block the home screen — the senior still
  /// needs the microphone, so the card just stays in its placeholder state.
  Future<void> _loadRequests() async {
    try {
      final requests = await RequestsService.instance.mine();
      if (!mounted) return;
      setState(() {
        _current = requests.isEmpty ? null : requests.first;
        _loadingRequests = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingRequests = false);
    }
  }

  /// Called when the requests screen pops, so accepting elsewhere (a volunteer
  /// on another device) shows up on return.
  Future<void> _openRequests() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const MyRequestsScreen()),
    );
    if (!mounted) return;
    _loadRequests();
  }

  /// Straight to the one request the card is describing, rather than making
  /// the senior find it in a list first.
  Future<void> _openCurrentRequest(HelpRequest request) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => SeniorRequestDetailScreen(
          request: request,
          onChanged: _loadRequests,
        ),
      ),
    );
    if (!mounted) return;
    _loadRequests();
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
      appBar: SahayakAppBar(
        subtitle: 'Senior Citizen Portal',
        onProfileTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SeniorProfileScreen()),
        ),
      ),
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

              const SizedBox(height: 12),

              // ── Current request: did somebody accept, and who ───────
              // Always rendered: it carries the "no active request yet" and
              // loading states, which are the answer to "is anything going
              // on?" just as much as the accepted case is.
              _CurrentRequestCard(
                request: _current,
                loading: _loadingRequests,
                onTap: _current == null
                    ? _openRequests
                    : () => _openCurrentRequest(_current!),
              ),

              const SizedBox(height: 12),

              // ── "My Requests" shortcut ───────────────────────────────
              GestureDetector(
                onTap: _openRequests,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.cardWhite,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.list_alt_outlined,
                          color: AppColors.accentBlue, size: 22),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'My Requests',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      Icon(Icons.chevron_right,
                          color: AppColors.textSecondary, size: 20),
                    ],
                  ),
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
                label: 'View my requests',
                outlined: true,
                icon: Icons.list_alt_outlined,
                color: AppColors.accentBlue,
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const SeniorMyRequestsScreen(),
                  ),
                ),
              ),

              const SizedBox(height: 10),

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

class _CurrentRequestCard extends StatelessWidget {
  final HelpRequest? request;
  final bool loading;
  final VoidCallback onTap;

  const _CurrentRequestCard({
    required this.request,
    required this.loading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final r = request;

    // Nothing to report yet: don't show a misleading "no volunteer" panel
    // before the request list has even loaded.
    if (loading) {
      return const _CardShell(
        child: Row(
          children: [
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 12),
            Text(
              'Checking your requests...',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    if (r == null) {
      return const _CardShell(
        child: Row(
          children: [
            Icon(Icons.hourglass_empty, color: AppColors.textSecondary, size: 20),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'No active request. Tap the microphone if you need help.',
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

    final acceptedBy = r.acceptedByLabel;
    final waiting = r.isAwaitingVolunteer;

    return GestureDetector(
      onTap: onTap,
      child: _CardShell(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: (acceptedBy != null ? AppColors.success : AppColors.warning)
                    .withAlpha(24),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                acceptedBy != null
                    ? Icons.person_pin_circle
                    : Icons.search,
                color: acceptedBy != null ? AppColors.success : AppColors.warning,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          acceptedBy ?? 'Looking for a volunteer',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      RequestStateBadge(status: r.status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    waiting
                        ? 'We are looking for someone nearby.'
                        : '${r.category.replaceAll('_', ' ')} · tap for details',
                    style: const TextStyle(
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
    );
  }
}

class _CardShell extends StatelessWidget {
  final Widget child;

  const _CardShell({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: child,
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
