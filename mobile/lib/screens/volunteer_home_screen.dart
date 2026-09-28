import 'dart:async';

import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/profile_service.dart';
import '../services/requests_service.dart';
import '../services/session_service.dart';
import '../services/user_session.dart';
import '../theme/app_colors.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/stat_card.dart';
import '../widgets/status_badge.dart';
import 'create_login_screen.dart';
import 'request_accepted_screen.dart';
import 'request_detail_screen.dart';

/// Volunteer dashboard backed by real data:
///   * nearby requests  -> GET /api/requests/nearby  (Q-04)
///   * my assignments   -> GET /api/requests/me      (Q-02)
///   * availability     -> PATCH /api/volunteers/me/availability (L-02)
///
/// Requests are delivered by polling, not push: the app has no FCM token (there
/// is no Firebase config in this project), so the backend's dispatch
/// notification is a no-op. Without polling a volunteer would only ever see a
/// request after a manual pull-to-refresh.
class VolunteerHomeScreen extends StatefulWidget {
  const VolunteerHomeScreen({super.key, this.pollInterval = _defaultPollInterval});

  /// Re-check cadence while the app is open. Null disables polling, which is
  /// what the widget tests use so their fake clock does not spin forever.
  static const Duration _defaultPollInterval = Duration(seconds: 15);
  final Duration? pollInterval;

  @override
  State<VolunteerHomeScreen> createState() => _VolunteerHomeScreenState();
}

class _VolunteerHomeScreenState extends State<VolunteerHomeScreen>
    with WidgetsBindingObserver {
  List<HelpRequest> _nearby = const [];
  List<HelpRequest> _mine = const [];
  final Set<String> _seenNearby = {};

  bool _loading = true;
  String? _error;
  bool _available = false;
  bool _availabilitySaving = false;
  bool _accepting = false;

  Timer? _pollTimer;
  bool _polling = false;
  bool _loadedOnce = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _startPolling();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    final interval = widget.pollInterval;
    if (interval == null) return;
    _pollTimer = Timer.periodic(interval, (_) => _poll());
  }

  /// Silent re-check. Skipped while another one is still in flight so a slow
  /// network cannot stack up requests every interval.
  Future<void> _poll() async {
    if (!mounted || _polling) return;
    _polling = true;
    try {
      await _load(silent: true, announceNew: true);
    } finally {
      _polling = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The other moment a request can have arrived while we were backgrounded.
    if (state == AppLifecycleState.resumed) _poll();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Nearest request the volunteer has not looked at yet.
  HelpRequest? get _newest => _nearby.isEmpty ? null : _nearby.first;
  int get _unseenCount => _nearby.where((r) => !_seenNearby.contains(r.id)).length;
  int get _activeCount => _mine
      .where((r) =>
          r.status == HelpRequestStatus.accepted ||
          r.status == HelpRequestStatus.inProgress)
      .length;
  int get _completedCount =>
      _mine.where((r) => r.status == HelpRequestStatus.completed).length;

  Future<void> _load({bool silent = false, bool announceNew = false}) async {
    if (!silent) setState(() { _loading = true; _error = null; });
    final knownIds = _nearby.map((r) => r.id).toSet();
    try {
      final me = await ProfileService.instance.fetchMe(force: true);
      final coords = me.baseCoordinates;
      if (coords == null) {
        setState(() {
          _error = 'Your volunteer profile has no base location yet. '
              'Re-register with a base location to see nearby requests.';
          _loading = false;
        });
        return;
      }
      final nearby = await RequestsService.instance.nearby(
        latitude: coords.latitude,
        longitude: coords.longitude,
      );
      final mine = await RequestsService.instance.mine();
      if (!mounted) return;
      // Only announce on a refresh of an already-populated screen, so the first
      // load after login does not fire a "new request" banner at someone who
      // is already looking at the list.
      final arrived = announceNew && _loadedOnce && _nearby.isNotEmpty
          ? nearby.where((r) => !knownIds.contains(r.id)).toList()
          : const <HelpRequest>[];
      setState(() {
        _nearby = nearby;
        _mine = mine;
        _available = me.isAvailable;
        _loading = false;
        _error = null;
        _loadedOnce = true;
      });
      if (arrived.isNotEmpty) {
        _toast(arrived.length == 1
            ? 'New help request nearby'
            : '${arrived.length} new help requests nearby');
      }
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

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _toggleAvailability(bool value) async {
    setState(() => _availabilitySaving = true);
    try {
      await RequestsService.instance.setAvailability(value);
      if (!mounted) return;
      setState(() {
        _available = value;
        _availabilitySaving = false;
      });
      _toast(value
          ? 'You are available. New nearby requests will show up.'
          : 'You are marked unavailable. Accept is disabled.');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _availabilitySaving = false);
      _toast(e.message);
    }
  }

  Future<void> _accept(HelpRequest request) async {
    setState(() => _accepting = true);
    try {
      await RequestsService.instance.accept(request.id);
      // Only now does the senior's contact data become visible (BR-09).
      final assigned = await RequestsService.instance.detail(request.id);
      if (!mounted) return;
      setState(() {
        _accepting = false;
        _nearby = _nearby.where((r) => r.id != request.id).toList();
        _mine = [assigned, ..._mine.where((r) => r.id != assigned.id)];
      });
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => RequestAcceptedScreen(request: assigned),
        ),
      );
      await _load(silent: true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _accepting = false);
      _toast(e.message);
      await _load(silent: true);
    }
  }

  /// Q-05b: turn the request down for real.
  ///
  /// The row is hidden immediately so the tap feels instant, but the decline is
  /// recorded server-side — otherwise the request comes back on the next
  /// refresh, because the server still has this volunteer in the dispatch
  /// batch. If the call fails the row is put back, so the UI never claims
  /// something the server did not accept.
  Future<void> _decline(HelpRequest request) async {
    final previous = _nearby;
    setState(() {
      _nearby = _nearby.where((r) => r.id != request.id).toList();
      _seenNearby.add(request.id);
    });
    try {
      await RequestsService.instance.decline(request.id);
      if (!mounted) return;
      _toast('Declined. It stays available to other volunteers.');
      await _load(silent: true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _nearby = previous);
      _toast(e.message);
    }
  }

  void _openDetail(HelpRequest request) {
    setState(() => _seenNearby.add(request.id));
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => RequestDetailScreen(
          request: request,
          isAvailable: _available,
          isAccepting: _accepting,
          onAccept: () async {
            Navigator.pop(context);
            await _accept(request);
          },
          onSkip: () {
            Navigator.pop(context);
            _decline(request);
          },
        ),
      ),
    );
  }

  void _showNotifications() {
    final request = _newest;
    if (request == null) {
      _toast('No new help requests right now.');
      return;
    }
    setState(() => _seenNearby.addAll(_nearby.map((r) => r.id)));
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _NotificationSheet(
        request: request,
        remaining: _nearby.length,
        busy: _accepting,
        onAccept: () {
          Navigator.pop(context);
          _accept(request);
        },
        onSkip: () {
          Navigator.pop(context);
          _decline(request);
        },
      ),
    );
  }

  Future<void> _logout() async {
    await SessionService.instance.clear();
    ProfileService.instance.clearCache();
    await UserSession.clear();
    if (!mounted) return;
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
        subtitle: 'Volunteer Portal',
        notificationCount: _unseenCount,
        onNotificationTap: _showNotifications,
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return ListView(
        children: const [
          SizedBox(height: 220),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }

    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SizedBox(
            height: 220,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_off_rounded,
                      size: 40, color: AppColors.textSecondary),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontSize: 13, color: AppColors.textSecondary),
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded, size: 18),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (!_available) ...[
          _OffDutyBanner(busy: _availabilitySaving, onGoOnDuty: () => _toggleAvailability(true)),
          const SizedBox(height: 14),
        ],
        const _SectionLabel('Overview'),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: StatCard(
                icon: Icons.inbox_outlined,
                iconColor: AppColors.warning,
                label: 'Nearby',
                value: '${_nearby.length}',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                icon: Icons.check_circle_outline,
                iconColor: AppColors.success,
                label: 'Active',
                value: '$_activeCount',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: StatCard(
                icon: Icons.done_all,
                iconColor: AppColors.accentBlue,
                label: 'Completed',
                value: '$_completedCount',
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _AvailabilityTile(
          value: _available,
          busy: _availabilitySaving,
          onChanged: _toggleAvailability,
        ),

        const SizedBox(height: 24),
        const _SectionLabel('Requests in Your Area'),
        const SizedBox(height: 10),
        if (_nearby.isEmpty)
          const Text(
            'No open requests nearby right now.',
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          )
        else
          ..._nearby.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RequestItem(
                request: r,
                showStatus: false,
                onTap: () => _openDetail(r),
              ),
            ),
          ),

        const SizedBox(height: 16),
        const _SectionLabel('Requests You Accepted'),
        const SizedBox(height: 10),
        if (_mine.isEmpty)
          const Text(
            'Nothing assigned to you yet.',
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          )
        else
          ..._mine.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _RequestItem(
                request: r,
                showStatus: true,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => RequestAcceptedScreen(request: r),
                  ),
                ),
              ),
            ),
          ),

        const SizedBox(height: 32),
        TextButton.icon(
          onPressed: _logout,
          icon: const Icon(Icons.logout, size: 16),
          label: const Text('Log out'),
          style: TextButton.styleFrom(foregroundColor: AppColors.textSecondary),
        ),
      ],
    );
  }
}

/// Shown while the volunteer is off duty. Off duty is the default after
/// registration, and the dispatcher only selects volunteers with
/// `is_available = true` — so without this the dashboard just reads
/// "Nearby 0" and looks like delivery is broken.
class _OffDutyBanner extends StatelessWidget {
  final bool busy;
  final VoidCallback onGoOnDuty;

  const _OffDutyBanner({required this.busy, required this.onGoOnDuty});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.pause_circle_filled,
                  size: 20, color: AppColors.warning),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'You are off duty',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'You will not receive any requests until you go on duty. '
            'Turn on availability and this list will fill up.',
            style: TextStyle(
                fontSize: 12.5, color: AppColors.textSecondary, height: 1.35),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 42,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.warning,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              icon: busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.play_arrow_rounded, size: 20),
              label: const Text('Go on duty',
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w700)),
              onPressed: busy ? null : onGoOnDuty,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvailabilityTile extends StatelessWidget {
  final bool value;
  final bool busy;
  final ValueChanged<bool> onChanged;

  const _AvailabilityTile({
    required this.value,
    required this.busy,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Icon(
            value ? Icons.volunteer_activism : Icons.pause_circle_outline,
            size: 20,
            color: value ? AppColors.success : AppColors.textSecondary,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              value ? 'Available for requests' : 'Not accepting requests',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ),
          if (busy)
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Switch(
              value: value,
              activeThumbColor: Colors.white,
              activeTrackColor: AppColors.success,
              inactiveThumbColor: Colors.white,
              inactiveTrackColor: AppColors.divider,
              onChanged: onChanged,
            ),
        ],
      ),
    );
  }
}

class _NotificationSheet extends StatelessWidget {
  final HelpRequest request;
  final int remaining;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onSkip;

  const _NotificationSheet({
    required this.request,
    required this.remaining,
    required this.busy,
    required this.onAccept,
    required this.onSkip,
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
            'New Help Request',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            remaining > 1
                ? 'Nearest of $remaining dispatched requests near you.'
                : 'A senior citizen needs assistance near you.',
            textAlign: TextAlign.center,
            style: const TextStyle(
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
                      _shortId(request.id),
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
                  icon: Icons.medical_services_outlined,
                  text: request.category,
                  bold: true,
                ),
                if (request.createdLabel != null) ...[
                  const SizedBox(height: 6),
                  _InfoRow(
                    icon: Icons.schedule_outlined,
                    text: 'Raised ${request.createdLabel}',
                  ),
                ],
                if (request.coordinateLabel != null) ...[
                  const SizedBox(height: 6),
                  _InfoRow(
                    icon: Icons.location_on_outlined,
                    text: request.coordinateLabel!,
                  ),
                ],
                if (request.distanceLabel != null) ...[
                  const SizedBox(height: 6),
                  _InfoRow(
                    icon: Icons.near_me_outlined,
                    text: '${request.distanceLabel} from your base',
                  ),
                ],
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
              onPressed: busy ? null : onAccept,
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
              onPressed: onSkip,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Senior contact details stay hidden until you accept, and the\n'
            'server assigns each request to exactly one volunteer.',
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

String _shortId(String id) =>
    id.length <= 8 ? id.toUpperCase() : id.substring(0, 8).toUpperCase();

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
  final bool showStatus;
  final VoidCallback onTap;

  const _RequestItem({
    required this.request,
    required this.showStatus,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final status = request.status;
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            request.category.isEmpty
                                ? 'Help request'
                                : request.category,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        PriorityBadge(priority: request.priority),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      request.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        if (showStatus && status != null) ...[
                          _MiniChip(
                            label: helpRequestStatusLabel(status),
                            color: status == HelpRequestStatus.completed
                                ? AppColors.success
                                : AppColors.accentBlue,
                          ),
                          const SizedBox(width: 8),
                        ],
                        if (request.distanceLabel != null) ...[
                          _MiniChip(
                            label: request.distanceLabel!,
                            color: AppColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                        ],
                        if (request.createdLabel != null)
                          _MiniChip(
                            label: request.createdLabel!,
                            color: AppColors.textSecondary,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right,
                  size: 18, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _MiniChip extends StatelessWidget {
  final String label;
  final Color color;

  const _MiniChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.scaffold,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.divider),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
