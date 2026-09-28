import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../theme/app_colors.dart';
import '../widgets/status_badge.dart';

/// Volunteer request detail for a nearby (DISPATCHED) request — Accept / Decline.
///
/// Only fields the backend actually returns are shown. The senior's name and
/// phone are intentionally absent here: `/api/requests/:id` only exposes them
/// to the volunteer once the request is assigned to them (BR-09).
class RequestDetailScreen extends StatelessWidget {
  final HelpRequest request;
  final bool isAvailable;
  final bool isAccepting;
  final Future<void> Function() onAccept;
  final VoidCallback onSkip;

  const RequestDetailScreen({
    super.key,
    required this.request,
    required this.isAvailable,
    required this.isAccepting,
    required this.onAccept,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.scaffold,
      appBar: AppBar(
        backgroundColor: AppColors.navyDark,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Colors.white, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Request Detail',
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              _shortId(request.id),
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HeaderCard(request: request),
          const SizedBox(height: 12),
          if (request.priority == RequestPriority.urgent) ...[
            const _UrgentBanner(),
            const SizedBox(height: 12),
          ],
          _DescriptionCard(request: request),
          const SizedBox(height: 12),
          _LocationCard(request: request),
          const SizedBox(height: 88),
        ],
      ),
      bottomNavigationBar: _StickyActions(
        enabled: isAvailable,
        busy: isAccepting,
        onAccept: onAccept,
        onSkip: onSkip,
      ),
    );
  }
}

String _shortId(String id) =>
    id.length <= 8 ? id.toUpperCase() : id.substring(0, 8).toUpperCase();

class _HeaderCard extends StatelessWidget {
  final HelpRequest request;
  const _HeaderCard({required this.request});

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
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AppColors.senior.withAlpha(40),
            child: const Icon(Icons.elderly_rounded,
                color: AppColors.senior, size: 26),
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
                        request.category.isEmpty
                            ? 'Help request'
                            : request.category,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    PriorityBadge(priority: request.priority),
                  ],
                ),
                const SizedBox(height: 6),
                _Line(
                  icon: Icons.fingerprint,
                  text: 'Request ${_shortId(request.id)}',
                ),
                if (request.status != null) ...[
                  const SizedBox(height: 4),
                  _Line(
                    icon: Icons.info_outline,
                    text: helpRequestStatusLabel(request.status!),
                  ),
                ],
                if (request.createdLabel != null) ...[
                  const SizedBox(height: 4),
                  _Line(
                    icon: Icons.schedule_outlined,
                    text: 'Raised ${request.createdLabel}',
                  ),
                ],
                if (request.source != null) ...[
                  const SizedBox(height: 4),
                  _Line(
                    icon: Icons.record_voice_over_outlined,
                    text: 'Source: ${request.source}',
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

class _Line extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Line({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 5),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ),
      ],
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
              'URGENT priority — please respond as soon as you can.',
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

class _DescriptionCard extends StatelessWidget {
  final HelpRequest request;
  const _DescriptionCard({required this.request});

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
            'What was asked',
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

class _LocationCard extends StatelessWidget {
  final HelpRequest request;
  const _LocationCard({required this.request});

  @override
  Widget build(BuildContext context) {
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
            'Location',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          if (request.coordinateLabel == null)
            const Text(
              'No coordinates were captured for this request.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            )
          else ...[
            Row(
              children: [
                const Icon(Icons.location_on_outlined,
                    size: 16, color: AppColors.senior),
                const SizedBox(width: 6),
                Text(
                  request.coordinateLabel!,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
            if (request.distanceLabel != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.near_me_outlined,
                      size: 16, color: AppColors.accentBlue),
                  const SizedBox(width: 6),
                  Text(
                    '${request.distanceLabel} from your registered base',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 10),
            const Text(
              'Addresses are not shared before a request is accepted.',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StickyActions extends StatelessWidget {
  final bool enabled;
  final bool busy;
  final Future<void> Function() onAccept;
  final VoidCallback onSkip;

  const _StickyActions({
    required this.enabled,
    required this.busy,
    required this.onAccept,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      color: AppColors.cardWhite,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_rounded, size: 20),
                  label: const Text(
                    'Accept Request',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  onPressed: enabled && !busy ? onAccept : null,
                ),
              ),
              const SizedBox(height: 4),
              if (!enabled)
                const Text(
                  'Turn on availability to accept requests.',
                  style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                ),
              TextButton(
                onPressed: onSkip,
                child: const Text(
                  'Decline this request',
                  style: TextStyle(
                    color: AppColors.error,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
