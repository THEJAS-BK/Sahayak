import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../theme/app_colors.dart';

enum VerificationStatus { pending, approved, rejected }

/// Chip badge matching web portal status pills
/// (PENDING yellow, APPROVED green, REJECTED red).
class StatusBadge extends StatelessWidget {
  final VerificationStatus status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: _fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  String get _label => switch (status) {
        VerificationStatus.pending  => 'PENDING',
        VerificationStatus.approved => 'APPROVED',
        VerificationStatus.rejected => 'REJECTED',
      };

  Color get _bg => switch (status) {
        VerificationStatus.pending  => const Color(0xFFFEF3C7),
        VerificationStatus.approved => const Color(0xFFDCFCE7),
        VerificationStatus.rejected => const Color(0xFFFFE4E6),
      };

  Color get _fg => switch (status) {
        VerificationStatus.pending  => AppColors.warning,
        VerificationStatus.approved => AppColors.success,
        VerificationStatus.rejected => AppColors.error,
      };
}

/// Priority chip for requests (URGENT / NORMAL), matching the backend
/// `help_requests.priority` values and the web portal's badge labels.
class PriorityBadge extends StatelessWidget {
  final RequestPriority priority;

  const PriorityBadge({super.key, required this.priority});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        requestPriorityLabel(priority),
        style: TextStyle(
          color: _fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Color get _bg => priority == RequestPriority.urgent
      ? const Color(0xFFFFE4E6)
      : const Color(0xFFDCFCE7);

  Color get _fg =>
      priority == RequestPriority.urgent ? AppColors.error : AppColors.success;
}
