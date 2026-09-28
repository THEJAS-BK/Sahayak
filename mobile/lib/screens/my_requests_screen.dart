import 'package:flutter/material.dart';

import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/requests_service.dart';
import '../theme/app_colors.dart';
import '../widgets/primary_button.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/status_badge.dart';
import 'senior_request_detail_screen.dart';

/// "My Requests" for a senior: did anybody accept, and who.
///
/// Everything on this screen comes from the live API — `GET /api/requests/me`
/// for the list (Q-02) and `GET /api/requests/:id/volunteer` for the phone
/// number (Q-08), which the server only releases once a volunteer is assigned.
/// Nothing is cached between visits, so opening the screen after a volunteer
/// accepts shows the new state.
class MyRequestsScreen extends StatefulWidget {
  const MyRequestsScreen({super.key});

  @override
  State<MyRequestsScreen> createState() => _MyRequestsScreenState();
}

class _MyRequestsScreenState extends State<MyRequestsScreen> {
  List<HelpRequest> _requests = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final requests = await RequestsService.instance.mine();
      if (!mounted) return;
      setState(() {
        _requests = requests;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not reach the server. Pull down to retry.';
        _loading = false;
      });
    }
  }

  Future<void> _refresh() async {
    try {
      final requests = await RequestsService.instance.mine();
      if (!mounted) return;
      setState(() {
        _requests = requests;
        _error = null;
      });
    } catch (_) {
      // Leave whatever is already on screen; the banner is not worth
      // replacing a working list over a failed background refresh.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: const SahayakAppBar(subtitle: 'My Requests'),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _refresh,
                child: _error != null
                    ? _Message(
                        icon: Icons.cloud_off_outlined,
                        text: _error!,
                        actionLabel: 'Try again',
                        onAction: _load,
                      )
                    : _requests.isEmpty
                        ? _Message(
                            icon: Icons.inbox_outlined,
                            text:
                                'You have not asked for help yet.\nTap the microphone on the home screen to call a volunteer.',
                            actionLabel: 'Refresh',
                            onAction: _load,
                          )
                        : ListView(
                            padding: const EdgeInsets.all(16),
                            children: [
                              for (final request in _requests)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: _RequestCard(
                                    request: request,
                                    onChanged: _load,
                                  ),
                                ),
                            ],
                          ),
              ),
      ),
    );
  }
}

/// One request in the list: what state it is in, and who took it.
///
/// Deliberately a summary — the phone number and the cancel action live on
/// [SeniorRequestDetailScreen], which re-reads the request when it opens. The
/// whole card is the tap target.
class _RequestCard extends StatelessWidget {
  final HelpRequest request;
  final VoidCallback onChanged;

  const _RequestCard({required this.request, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final r = request;
    return GestureDetector(
      onTap: () async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SeniorRequestDetailScreen(
              request: r,
              onChanged: onChanged,
            ),
          ),
        );
        // The detail screen may have cancelled it, or a volunteer may have
        // accepted while it was open.
        onChanged();
      },
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    _title(r.category),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                RequestStateBadge(status: r.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              r.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            _WhoAccepted(request: r),
            const SizedBox(height: 8),
            Row(
              children: [
                if (r.createdLabel != null)
                  Text(
                    r.createdLabel!,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                const Spacer(),
                const Text(
                  'View details',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accentBlue,
                  ),
                ),
                const Icon(Icons.chevron_right,
                    color: AppColors.accentBlue, size: 16),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// "Accepted by Ravi", or the waiting copy when nobody has taken it yet.
class _WhoAccepted extends StatelessWidget {
  final HelpRequest request;

  const _WhoAccepted({required this.request});

  @override
  Widget build(BuildContext context) {
    final headline = request.acceptedByLabel;

    if (headline != null) {
      return Row(
        children: [
          const Icon(Icons.person_pin_circle, color: AppColors.success, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              headline,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
      );
    }

    if (request.isAccepted) {
      // Accepted, but the name has not come back yet. Better to say so than to
      // imply nobody helped.
      return const _Note(
        icon: Icons.hourglass_empty,
        text: 'A volunteer accepted. Their name is still loading.',
        color: AppColors.warning,
      );
    }

    if (request.isAwaitingVolunteer) {
      return const _Note(
        icon: Icons.search,
        text: 'No volunteer has accepted yet. We are still looking nearby.',
        color: AppColors.warning,
      );
    }

    if (request.status == HelpRequestStatus.cancelled) {
      return const _Note(
        icon: Icons.cancel_outlined,
        text: 'You cancelled this request.',
        color: AppColors.textSecondary,
      );
    }

    if (request.status == HelpRequestStatus.completed) {
      return const _Note(
        icon: Icons.check_circle_outline,
        text: 'This request is complete. Thank you.',
        color: AppColors.success,
      );
    }

    return const SizedBox.shrink();
  }
}

class _Note extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;

  const _Note({required this.icon, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textPrimary,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Empty / error state for the whole screen.
class _Message extends StatelessWidget {
  final IconData icon;
  final String text;
  final String actionLabel;
  final VoidCallback onAction;

  const _Message({
    required this.icon,
    required this.text,
    required this.actionLabel,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 40),
        Icon(icon, size: 48, color: AppColors.divider),
        const SizedBox(height: 16),
        Text(
          text,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.textSecondary,
            height: 1.5,
          ),
        ),
        const SizedBox(height: 24),
        PrimaryButton(label: actionLabel, outlined: true, onPressed: onAction),
      ],
    );
  }
}

/// `grocery_assistance` -> `Grocery assistance`.
String _title(String category) {
  if (category.isEmpty) return 'Help request';
  final words = category.replaceAll('_', ' ').trim();
  if (words.isEmpty) return 'Help request';
  return words[0].toUpperCase() + words.substring(1);
}
