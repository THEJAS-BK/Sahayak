import 'package:flutter/material.dart';
import '../models/help_request.dart';
import '../theme/app_colors.dart';

/// Shown right after the volunteer accepts a request (Figma Screen 4).
class RequestAcceptedScreen extends StatefulWidget {
  final HelpRequest request;

  const RequestAcceptedScreen({super.key, required this.request});

  @override
  State<RequestAcceptedScreen> createState() => _RequestAcceptedScreenState();
}

class _RequestAcceptedScreenState extends State<RequestAcceptedScreen> {
  /// 0 = Accepted, 1 = En Route, 2 = Arrived, 3 = Completed
  int _step = 1;

  HelpRequest get request => widget.request;

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
        title: const Text(
          'Request Accepted',
          style: TextStyle(
            color: Colors.white,
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 8),
          Center(
            child: Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.success.withAlpha(28),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.success.withAlpha(60),
                    blurRadius: 24,
                    spreadRadius: 4,
                  ),
                ],
              ),
              child: const Icon(
                Icons.check_rounded,
                color: AppColors.success,
                size: 48,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'You have agreed to help ${request.caller}. Please reach the location within ${request.deadline}.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              height: 1.45,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 20),
          _SummaryCard(request: request),
          const SizedBox(height: 16),
          _Timeline(step: _step),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: Material(
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
                      backgroundColor: AppColors.accentBlue,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.directions_outlined, size: 20),
                    label: const Text(
                      'Get Directions',
                      style:
                          TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                              'Directions to ${request.location} (${request.distance}).'),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.accentBlue,
                      side: const BorderSide(color: AppColors.accentBlue),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: _step >= 2
                        ? null
                        : () {
                            setState(() => _step = 2);
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Marked as arrived.'),
                                backgroundColor: AppColors.success,
                              ),
                            );
                          },
                    child: const Text(
                      'Mark as Arrived',
                      style:
                          TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    final messenger = ScaffoldMessenger.of(context);
                    Navigator.of(context).pop();
                    messenger.showSnackBar(
                      const SnackBar(
                        content: Text('Assignment cancelled for this demo.'),
                      ),
                    );
                  },
                  child: const Text(
                    'Cancel',
                    style: TextStyle(
                      color: AppColors.error,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final HelpRequest request;
  const _SummaryCard({required this.request});

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
        children: [
          _row(Icons.location_on_outlined, 'Location', request.location),
          const Divider(height: 20, color: AppColors.divider),
          _row(Icons.timer_outlined, 'Deadline', request.deadline),
          const Divider(height: 20, color: AppColors.divider),
          _row(Icons.task_alt_outlined, 'Task', request.category),
          const Divider(height: 20, color: AppColors.divider),
          _row(Icons.straighten, 'Distance', request.distance),
        ],
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 10),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
        const Spacer(),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  final int step;
  const _Timeline({required this.step});

  static const _labels = ['Accepted', 'En Route', 'Arrived', 'Completed'];

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
        children: [
          for (var i = 0; i < _labels.length; i++) ...[
            Row(
              children: [
                _dot(i),
                const SizedBox(width: 12),
                Text(
                  _labels[i],
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: i == step ? FontWeight.w700 : FontWeight.w500,
                    color: i <= step
                        ? AppColors.textPrimary
                        : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
            if (i < _labels.length - 1)
              Padding(
                padding: const EdgeInsets.only(left: 9),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 2,
                    height: 18,
                    color: i < step ? AppColors.success : AppColors.divider,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _dot(int i) {
    if (i < step) {
      return Container(
        width: 20,
        height: 20,
        decoration: const BoxDecoration(
          color: AppColors.success,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.check, size: 12, color: Colors.white),
      );
    }
    if (i == step) {
      return Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          color: AppColors.accentBlue.withAlpha(30),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.accentBlue, width: 2),
        ),
      );
    }
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.divider, width: 2),
      ),
    );
  }
}
