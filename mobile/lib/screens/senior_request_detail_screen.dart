import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/requests_service.dart';
import '../theme/app_colors.dart';
import '../widgets/primary_button.dart';
import '../widgets/sahayak_app_bar.dart';
import '../widgets/status_badge.dart';

/// Full view of one of the senior's own requests.
///
/// Re-reads from the API on open (`GET /api/requests/:id`, Q-03) rather than
/// trusting the copy the list screen was holding, so tapping in long after the
/// list loaded still shows the current state. The volunteer's phone comes from
/// Q-08, which the server only releases once somebody is assigned — so that
/// call is made lazily and a 403 is treated as "not yet", not as a failure.
class SeniorRequestDetailScreen extends StatefulWidget {
  final HelpRequest request;

  /// Told when something on this screen changed the request (a cancel), so the
  /// list behind it can re-read. Not awaited — the caller refreshes on return
  /// anyway.
  final VoidCallback? onChanged;

  const SeniorRequestDetailScreen({
    super.key,
    required this.request,
    this.onChanged,
  });

  @override
  State<SeniorRequestDetailScreen> createState() =>
      _SeniorRequestDetailScreenState();
}

class _SeniorRequestDetailScreenState extends State<SeniorRequestDetailScreen> {
  late HelpRequest _request = widget.request;
  VolunteerContact? _contact;
  bool _loading = true;
  bool _cancelling = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final fresh = await RequestsService.instance.detail(_request.id);
      if (!mounted) return;
      setState(() {
        _request = fresh;
        _loading = false;
        _error = null;
      });
      if (fresh.isAccepted) _loadContact();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not reach the server.';
        _loading = false;
      });
    }
  }

  Future<void> _loadContact() async {
    try {
      final contact = await RequestsService.instance.volunteerContact(_request.id);
      if (!mounted) return;
      setState(() => _contact = contact);
    } catch (_) {
      // The card falls back to the name from Q-03, so a missing phone number
      // is not worth an error state.
    }
  }

  Future<void> _call() async {
    final contact = _contact;
    if (contact == null || contact.dialNumber.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: contact.dialNumber);
    if (!await canLaunchUrl(uri)) {
      if (!mounted) return;
      setState(() => _error = 'This device cannot place calls.');
      return;
    }
    await launchUrl(uri);
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this request?'),
        content: const Text(
          'The volunteer will not be told. You can ask for help again any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep it'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel request'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _cancelling = true);
    try {
      await RequestsService.instance.cancel(_request.id);
      if (!mounted) return;
      setState(() {
        _request = _request.copyWith(status: HelpRequestStatus.cancelled);
        _cancelling = false;
      });
      widget.onChanged?.call();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _cancelling = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final request = _request;
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: SahayakAppBar(
        subtitle: 'Request ${_shortId(request.id)}',
        showBack: true,
        showActions: false,
      ),
      body: SafeArea(
        child: _error != null && _loading
            ? Center(child: Text(_error!))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null) ...[
                    _ErrorNote(message: _error!, onRetry: _load),
                    const SizedBox(height: 12),
                  ],
                  _HeaderCard(request: request, loading: _loading),
                  if (request.priority == RequestPriority.urgent) ...[
                    const SizedBox(height: 12),
                    const _UrgentBanner(),
                  ],
                  const SizedBox(height: 12),
                  _WhatWasAsked(request: request),
                  if (request.hasImage) ...[
                    const SizedBox(height: 12),
                    _PhotoCard(request: request),
                  ],
                  const SizedBox(height: 12),
                  _Timeline(request: request),
                  const SizedBox(height: 12),
                  _VolunteerCard(
                    request: request,
                    contact: _contact,
                    onCall: _call,
                  ),
                  if (request.isCancellable) ...[
                    const SizedBox(height: 16),
                    PrimaryButton(
                      label: _cancelling ? 'Cancelling...' : 'Cancel request',
                      outlined: true,
                      color: AppColors.error,
                      icon: Icons.close,
                      onPressed: _cancelling ? null : _cancel,
                    ),
                  ],
                  const SizedBox(height: 24),
                ],
              ),
      ),
    );
  }
}

String _shortId(String id) =>
    id.length <= 8 ? id.toUpperCase() : id.substring(0, 8).toUpperCase();

class _HeaderCard extends StatelessWidget {
  final HelpRequest request;
  final bool loading;

  const _HeaderCard({required this.request, required this.loading});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.senior.withAlpha(40),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.elderly_rounded,
                color: AppColors.senior, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _prettyCategory(request.category),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    RequestStateBadge(status: request.status),
                    PriorityBadge(priority: request.priority),
                  ],
                ),
                if (request.createdLabel != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Raised ${request.createdLabel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
                if (request.coordinateLabel != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'From ${request.coordinateLabel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
                if (loading) ...[
                  const SizedBox(height: 8),
                  const Row(
                    children: [
                      SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(strokeWidth: 2)),
                      SizedBox(width: 8),
                      Text(
                        'Refreshing...',
                        style: TextStyle(
                            fontSize: 11, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _UrgentBanner extends StatelessWidget {
  const _UrgentBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFE4E6),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withAlpha(60)),
      ),
      child: const Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'This request was marked urgent.',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WhatWasAsked extends StatelessWidget {
  final HelpRequest request;

  const _WhatWasAsked({required this.request});

  @override
  Widget build(BuildContext context) {
    final chips = request.detailChips;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'What you asked for',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            request.description.isEmpty
                ? 'No description was provided.'
                : request.description,
            style: const TextStyle(
              fontSize: 13,
              height: 1.45,
              color: AppColors.textPrimary,
            ),
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: chips
                  .map(
                    (chip) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.scaffold,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: Text(
                        chip,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

/// The photo the senior attached, tap to view full screen.
///
/// Served straight from Cloudinary, so it needs no backend call and no
/// download step here — the same URL every client gets. It can fail to load
/// (revoked upload, offline), which is why the tile reports it rather than
/// showing a broken box.
class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.request});

  final HelpRequest request;

  @override
  Widget build(BuildContext context) {
    final url = request.imageUrl!;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your photo',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => _FullScreenPhoto(url: url),
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: AspectRatio(
                aspectRatio: 4 / 3,
                child: Image.network(
                  url,
                  fit: BoxFit.cover,
                  loadingBuilder: (context, child, progress) => progress == null
                      ? child
                      : Container(
                          color: AppColors.scaffold,
                          alignment: Alignment.center,
                          child: const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                  errorBuilder: (_, __, ___) => Container(
                    color: AppColors.scaffold,
                    alignment: Alignment.center,
                    child: const Text(
                      'This photo could not be loaded.',
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Tap to view full size',
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// The photo on its own, for when the senior wants a closer look.
class _FullScreenPhoto extends StatelessWidget {
  const _FullScreenPhoto({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Photo',
          style: TextStyle(color: Colors.white, fontSize: 16),
        ),
      ),
      body: Center(
        child: InteractiveViewer(
          maxScale: 4,
          child: Image.network(
            url,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const Text(
              'This photo could not be loaded.',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ),
        ),
      ),
    );
  }
}

/// When things happened, in the senior's language. Each step only appears once
/// the server has actually recorded it, so the list never promises something
/// that has not happened yet.
class _Timeline extends StatelessWidget {
  final HelpRequest request;

  const _Timeline({required this.request});

  @override
  Widget build(BuildContext context) {
    final steps = <_Step>[
      _Step(
        icon: Icons.send_outlined,
        label: 'Request sent',
        at: request.createdAt,
        done: request.createdAt != null,
      ),
      _Step(
        icon: Icons.person_search_outlined,
        label: 'Volunteer notified',
        at: request.dispatchedAt,
        done: request.isAwaitingVolunteer || request.isAccepted,
      ),
      _Step(
        icon: Icons.check_circle_outline,
        label: 'Accepted by a volunteer',
        at: request.acceptedAt,
        done: request.isAccepted,
      ),
      _Step(
        icon: Icons.flag_outlined,
        label: 'Completed',
        at: request.completedAt,
        done: request.status == HelpRequestStatus.completed,
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Progress',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          for (final step in steps)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    step.icon,
                    size: 18,
                    color: step.done
                        ? AppColors.success
                        : AppColors.divider,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          step.label,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: step.done
                                ? AppColors.textPrimary
                                : AppColors.textSecondary,
                          ),
                        ),
                        if (step.at != null)
                          Text(
                            _clock(step.at!),
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textSecondary,
                            ),
                          ),
                      ],
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

class _Step {
  final IconData icon;
  final String label;
  final DateTime? at;
  final bool done;

  const _Step({
    required this.icon,
    required this.label,
    required this.at,
    required this.done,
  });
}

/// `2:35 pm` on the day, or `26 Sep, 2:35 pm` when it is not today.
String _clock(DateTime at) {
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  final minute = at.minute.toString().padLeft(2, '0');
  final meridiem = at.hour < 12 ? 'am' : 'pm';
  final now = DateTime.now();
  final sameDay =
      at.year == now.year && at.month == now.month && at.day == now.day;
  if (sameDay) return '$hour:$minute $meridiem';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${at.day} ${months[at.month - 1]}, $hour:$minute $meridiem';
}

/// Who took the request and how to reach them.
class _VolunteerCard extends StatelessWidget {
  final HelpRequest request;
  final VolunteerContact? contact;
  final VoidCallback onCall;

  const _VolunteerCard({
    required this.request,
    required this.contact,
    required this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    final name = request.assignedVolunteerName;
    final org = contact?.organization;
    final skills = contact?.skills ?? const <String>[];

    if (!request.isAccepted || (name == null && contact == null)) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Row(
          children: [
            const Icon(Icons.hourglass_empty,
                color: AppColors.warning, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                request.status == HelpRequestStatus.cancelled
                    ? 'You cancelled this request, so nobody was asked.'
                    : 'No volunteer has accepted yet. We are still looking nearby.',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textPrimary,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final resolvedName =
        name ?? contact?.fullName ?? 'Your volunteer';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.success.withAlpha(80)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: AppColors.success.withAlpha(40),
                child: const Icon(Icons.person,
                    color: AppColors.success, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      resolvedName,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    Text(
                      [
                        if (request.acceptedLabel != null) 'Accepted',
                        if (org != null && org.isNotEmpty) org,
                      ].join(' · '),
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (skills.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: skills
                  .map(
                    (skill) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.scaffold,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: Text(
                        skill.replaceAll('_', ' '),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
          if (contact != null) ...[
            const SizedBox(height: 14),
            PrimaryButton(
              label: 'Call $resolvedName',
              icon: Icons.phone,
              color: AppColors.volunteer,
              onPressed: onCall,
            ),
          ],
        ],
      ),
    );
  }
}

class _ErrorNote extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorNote({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.error.withAlpha(20),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withAlpha(60)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.error, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: AppColors.textPrimary),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

String _prettyCategory(String category) {
  final words = category.replaceAll('_', ' ').trim();
  if (words.isEmpty) return 'Help request';
  return words[0].toUpperCase() + words.substring(1);
}
