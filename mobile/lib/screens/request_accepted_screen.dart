import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/help_request.dart';
import '../services/api_client.dart';
import '../services/requests_service.dart';
import '../theme/app_colors.dart';

/// Assignment view for a request the volunteer has accepted.
///
/// The three steps map 1:1 to the server state machine
/// (ACCEPTED -> IN_PROGRESS -> COMPLETED, Q-06) — there is no fake "arrived"
/// step and no local-only cancel, because the backend exposes neither.
class RequestAcceptedScreen extends StatefulWidget {
  final HelpRequest request;

  const RequestAcceptedScreen({super.key, required this.request});

  @override
  State<RequestAcceptedScreen> createState() => _RequestAcceptedScreenState();
}

class _RequestAcceptedScreenState extends State<RequestAcceptedScreen> {
  late HelpRequest _request = widget.request;
  late HelpRequestStatus? _status = widget.request.status;
  bool _busy = false;
  String? _error;

  static const _steps = [
    HelpRequestStatus.accepted,
    HelpRequestStatus.inProgress,
    HelpRequestStatus.completed,
  ];

  int get _stepIndex {
    final status = _status;
    if (status == null) return 0;
    final index = _steps.indexOf(status);
    return index < 0 ? 0 : index;
  }

  Future<void> _advance(HelpRequestStatus target) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await RequestsService.instance.setStatus(_request.id, target);
      // Re-read from the server so the screen always shows stored state.
      final fresh = await RequestsService.instance.detail(_request.id);
      if (!mounted) return;
      setState(() {
        _request = fresh;
        _status = fresh.status;
        _busy = false;
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Marked as ${helpRequestStatusLabel(target)}'),
          backgroundColor: AppColors.success,
        ));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Could not reach the server.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final next = _stepIndex < _steps.length - 1 ? _steps[_stepIndex + 1] : null;
    final done = _status == HelpRequestStatus.completed;

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
          'Your Assignment',
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
              child: Icon(
                done ? Icons.task_alt_rounded : Icons.check_rounded,
                color: AppColors.success,
                size: 48,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            done
                ? 'You completed the request for ${_seniorLabel()}.'
                : 'You have agreed to help ${_seniorLabel()}.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              height: 1.45,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 20),
          _ContactCard(request: _request),
          const SizedBox(height: 16),
          _SummaryCard(request: _request),
          const SizedBox(height: 16),
          _Timeline(step: _stepIndex),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFE4E6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.error.withAlpha(60)),
              ),
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 12, color: AppColors.error),
              ),
            ),
          ],
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: next == null
          ? null
          : Material(
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
                          icon: _busy
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white),
                                )
                              : Icon(
                                  next == HelpRequestStatus.inProgress
                                      ? Icons.directions_walk_rounded
                                      : Icons.task_alt_rounded,
                                  size: 20,
                                ),
                          label: Text(
                            next == HelpRequestStatus.inProgress
                                ? 'Start the job'
                                : 'Mark as completed',
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                          onPressed: _busy ? null : () => _advance(next),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  String _seniorLabel() {
    final name = _request.seniorName;
    if (name == null || name.isEmpty) return 'the senior';
    return name;
  }
}

/// Senior contact becomes visible only after the server assigns the request.
/// Opens the platform dialer with the number the API returned.  The button is
/// only rendered when the backend actually shared a phone number.
Future<void> _call(BuildContext context, String phone) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = Uri(scheme: 'tel', path: phone);
  var launched = false;
  try {
    launched = await launchUrl(uri);
  } catch (_) {
    launched = false;
  }
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(
        launched ? 'Opening the dialer for $phone' : 'No dialer available on this device',
      ),
    ));
}

class _ContactCard extends StatelessWidget {
  final HelpRequest request;
  const _ContactCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final name = request.seniorName;
    final phone = request.seniorPhone;
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
            radius: 24,
            backgroundColor: AppColors.senior.withAlpha(40),
            child: Text(
              name == null || name.isEmpty ? '?' : name[0].toUpperCase(),
              style: const TextStyle(
                color: AppColors.senior,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name ?? 'Senior',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  phone ?? 'Phone not shared',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (phone != null)
            IconButton(
              tooltip: 'Call senior',
              onPressed: () => _call(context, phone),
              icon: const Icon(Icons.call_rounded, color: AppColors.success),
            ),
        ],
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
          _row(Icons.medical_services_outlined, 'Task',
              request.category.isEmpty ? 'Help request' : request.category),
          const Divider(height: 20, color: AppColors.divider),
          _row(
            Icons.location_on_outlined,
            'Location',
            request.placeLabel ?? 'Not captured',
          ),
          const Divider(height: 20, color: AppColors.divider),
          _row(
            Icons.flag_outlined,
            'Priority',
            requestPriorityLabel(request.priority),
          ),
          if (request.acceptedAt != null) ...[
            const Divider(height: 20, color: AppColors.divider),
            _row(Icons.schedule_outlined, 'Accepted at',
                _clock(request.acceptedAt!)),
          ],
          if (request.description.isNotEmpty) ...[
            const Divider(height: 20, color: AppColors.divider),
            _row(Icons.notes_outlined, 'Details', request.description),
          ],
        ],
      ),
    );
  }

  static String _clock(DateTime value) {
    final h = value.hour.toString().padLeft(2, '0');
    final m = value.minute.toString().padLeft(2, '0');
    return '$h:$m';
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
        const SizedBox(width: 12),
        Expanded(
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

  static const _labels = ['Accepted', 'In progress', 'Completed'];

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
