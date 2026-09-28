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

/// Lifecycle chip for a help request, in the senior's own words.
///
/// The police console and the volunteer screens show the raw status
/// (DISPATCHED, UNASSIGNED); none of that means anything to the person who
/// asked for help, so this renders [HelpRequest.seniorStatusLabel] instead.
/// A null status — Q-04 omits it — falls back to "Sent" rather than an empty
/// pill.
class RequestStateBadge extends StatelessWidget {
  final HelpRequestStatus? status;

  const RequestStateBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: _bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        seniorStatusLabel(status),
        textAlign: TextAlign.center,
        style: TextStyle(
          color: _fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Color get _fg {
    switch (status) {
      case HelpRequestStatus.accepted:
      case HelpRequestStatus.inProgress:
      case HelpRequestStatus.completed:
        return AppColors.success;
      case HelpRequestStatus.cancelled:
        return AppColors.textSecondary;
      case HelpRequestStatus.unassigned:
        return AppColors.error;
      default:
        return AppColors.warning;
    }
  }

  Color get _bg {
    switch (status) {
      case HelpRequestStatus.accepted:
      case HelpRequestStatus.inProgress:
      case HelpRequestStatus.completed:
        return const Color(0xFFDCFCE7);
      case HelpRequestStatus.cancelled:
        return const Color(0xFFF1F5F9);
      case HelpRequestStatus.unassigned:
        return const Color(0xFFFFE4E6);
      default:
        return const Color(0xFFFEF3C7);
    }
  }
}

/// Lifecycle chip for help requests (PENDING / IN PROGRESS / COMPLETED / …).
enum HelpRequestStatus { pending, inProgress, completed, declined, cancelled }

class HelpRequestStatusBadge extends StatelessWidget {
  final HelpRequestStatus status;

  const HelpRequestStatusBadge({super.key, required this.status});

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
        HelpRequestStatus.pending => 'PENDING',
        HelpRequestStatus.inProgress => 'IN PROGRESS',
        HelpRequestStatus.completed => 'COMPLETED',
        HelpRequestStatus.declined => 'DECLINED',
        HelpRequestStatus.cancelled => 'CANCELLED',
      };

  Color get _bg => switch (status) {
        HelpRequestStatus.pending => const Color(0xFFFEF3C7),
        HelpRequestStatus.inProgress => const Color(0xFFDBEAFE),
        HelpRequestStatus.completed => const Color(0xFFDCFCE7),
        HelpRequestStatus.declined => const Color(0xFFFFE4E6),
        HelpRequestStatus.cancelled => const Color(0xFFFFE4E6),
      };

  Color get _fg => switch (status) {
        HelpRequestStatus.pending => AppColors.warning,
        HelpRequestStatus.inProgress => AppColors.accentBlue,
        HelpRequestStatus.completed => AppColors.success,
        HelpRequestStatus.declined => AppColors.error,
        HelpRequestStatus.cancelled => AppColors.error,
      };
}
