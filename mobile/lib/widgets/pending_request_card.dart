import 'package:flutter/material.dart';

import '../services/voice_payload.dart';
import '../theme/app_colors.dart';
import 'request_review_dialog.dart';

/// Strip above the mic button for a request the senior chose to keep instead of
/// sending. Tapping it re-opens the review dialog with the saved draft.
class PendingRequestCard extends StatelessWidget {
  const PendingRequestCard({
    super.key,
    required this.request,
    required this.onReview,
  });

  final VoiceHelpRequest request;
  final VoidCallback onReview;

  @override
  Widget build(BuildContext context) {
    final urgent = request.priority == 'urgent';
    final dotColor = urgent ? AppColors.error : AppColors.warning;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Material(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onReview,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.divider),
            ),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Ready to send · ${categoryLabel(request.category)}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        request.description.trim(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'Review',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accentBlue,
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: AppColors.accentBlue,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
