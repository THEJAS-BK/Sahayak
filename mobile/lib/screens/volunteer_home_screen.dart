import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../services/user_session.dart';
import '../theme/app_colors.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/stat_card.dart';
import '../widgets/status_badge.dart';
import 'create_login_screen.dart';
import 'request_accepted_screen.dart';
import 'request_detail_screen.dart';

class VolunteerHomeScreen extends StatefulWidget {
  const VolunteerHomeScreen({super.key});

  @override
  State<VolunteerHomeScreen> createState() => _VolunteerHomeScreenState();
}

class _VolunteerHomeScreenState extends State<VolunteerHomeScreen> {
  int _pendingNotifications = 1;
  HelpRequest? _incoming = HelpRequest.incoming;
  final List<HelpRequest> _areaRequests = [...HelpRequest.area];
  final List<HelpRequest> _accepted = [HelpRequest.acceptedSeed];

  void _logout(BuildContext context) async {
    await UserSession.clear();
    if (!context.mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const CreateLoginScreen()),
      (route) => false,
    );
  }

  void _showNotificationSheet() {
    setState(() => _pendingNotifications = 0);
    final incoming = _incoming;
    if (incoming == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No new help requests right now.')),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _NotificationSheet(
        request: incoming,
        onAccept: () {
          Navigator.pop(context);
          _acceptRequest(incoming);
        },
        onDecline: () {
          Navigator.pop(context);
          setState(() => _incoming = null);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                  'Request declined. It will be passed to another volunteer.'),
            ),
          );
        },
      ),
    );
  }

  void _openDetail(HelpRequest request) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RequestDetailScreen(
          request: request,
          onAccept: () {
            Navigator.pop(context);
            _acceptRequest(request);
          },
          onDecline: () {
            Navigator.pop(context);
            _declineAreaRequest(request);
          },
        ),
      ),
    );
  }

  void _acceptRequest(HelpRequest request) {
    setState(() {
      _areaRequests.removeWhere((r) => r.id == request.id);
      if (!_accepted.any((r) => r.id == request.id)) {
        _accepted.insert(0, request);
      }
      if (_incoming?.id == request.id) {
        _incoming = null;
        _pendingNotifications = 0;
      }
    });
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RequestAcceptedScreen(request: request),
      ),
    );
  }

  void _declineAreaRequest(HelpRequest request) {
    setState(() {
      _areaRequests.removeWhere((r) => r.id == request.id);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            '${request.id} declined. It will be passed to another volunteer.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: SahayakAppBar(
        subtitle: 'Volunteer Portal',
        notificationCount: _pendingNotifications,
        onNotificationTap: _showNotificationSheet,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _SectionLabel('Overview'),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: StatCard(
                  icon: Icons.inbox_outlined,
                  iconColor: AppColors.warning,
                  label: 'Open Requests',
                  value: '${_areaRequests.length}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: StatCard(
                  icon: Icons.check_circle_outline,
                  iconColor: AppColors.success,
                  label: 'Accepted',
                  value: '${_accepted.length}',
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: StatCard(
                  icon: Icons.done_all,
                  iconColor: AppColors.accentBlue,
                  label: 'Completed',
                  value: '14',
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          const _SectionLabel('Requests in Your Area'),
          const SizedBox(height: 10),
          if (_areaRequests.isEmpty)
            const Text(
              'No open requests nearby.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            )
          else
            ..._areaRequests.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _RequestItem(
                  request: r,
                  onTap: () => _openDetail(r),
                ),
              ),
            ),

          const SizedBox(height: 16),

          const _SectionLabel('Requests You Accepted'),
          const SizedBox(height: 10),
          ..._accepted.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RequestItem(
                request: r,
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => RequestAcceptedScreen(request: r),
                    ),
                  );
                },
              ),
            ),
          ),

          const SizedBox(height: 32),
          TextButton.icon(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout, size: 16),
            label: const Text('Log out'),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationSheet extends StatelessWidget {
  final HelpRequest request;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const _NotificationSheet({
    required this.request,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.divider,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.warning.withAlpha(30),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.notifications_active_outlined,
              color: AppColors.warning,
              size: 28,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'New Help Request!',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'A senior citizen needs assistance near you.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.scaffold,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      request.id,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                        fontFamily: 'monospace',
                      ),
                    ),
                    PriorityBadge(priority: request.priority),
                  ],
                ),
                const SizedBox(height: 10),
                _InfoRow(
                  icon: Icons.person_outline,
                  text: request.caller,
                  bold: true,
                ),
                const SizedBox(height: 6),
                _InfoRow(
                  icon: Icons.location_on_outlined,
                  text: request.location,
                ),
                const SizedBox(height: 6),
                _InfoRow(
                  icon: Icons.schedule_outlined,
                  text: request.time,
                ),
                const SizedBox(height: 6),
                _InfoRow(
                  icon: Icons.medical_services_outlined,
                  text: request.category,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              icon: const Icon(Icons.check_rounded, size: 20),
              label: const Text(
                'Accept Request',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
              onPressed: onAccept,
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error, width: 1.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.close_rounded, size: 20),
              label: const Text(
                'Decline',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
              onPressed: onDecline,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'You have 5 minutes to respond before this is\npassed to another volunteer.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool bold;

  const _InfoRow({
    required this.icon,
    required this.text,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 13,
              color: AppColors.textPrimary,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
        letterSpacing: 0.1,
      ),
    );
  }
}

class _RequestItem extends StatelessWidget {
  final HelpRequest request;
  final VoidCallback onTap;

  const _RequestItem({
    required this.request,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardWhite,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.divider),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 72,
                child: Text(
                  request.id,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.caller,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        const Icon(Icons.location_on_outlined,
                            size: 11, color: AppColors.textSecondary),
                        const SizedBox(width: 2),
                        Expanded(
                          child: Text(
                            request.location,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              PriorityBadge(priority: request.priority),
              const SizedBox(width: 10),
              Text(
                request.time,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right,
                  size: 18, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
