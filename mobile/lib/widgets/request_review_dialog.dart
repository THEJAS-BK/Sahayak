import 'package:flutter/material.dart';

import '../services/voice_payload.dart';
import '../theme/app_colors.dart';
import 'primary_button.dart';

/// Category keys the voice agent is allowed to send (see `agent.py` HELP_CATEGORY)
/// paired with the labels shown to the senior.
const Map<String, String> kCategoryLabels = {
  'grocery_assistance': 'Groceries',
  'medical_assistance': 'Medical help',
  'transport_assistance': 'Transport',
  'other': 'Something else',
};

/// Human label for a raw category key, falling back to the key itself.
String categoryLabel(String category) {
  return kCategoryLabels[category] ??
      category.replaceAll('_', ' ').toLowerCase();
}

/// Centered review sheet for a help request the voice agent just gathered.
///
/// Shows the agent's reading of the request and lets the senior correct the
/// category, priority and description before it is sent. Resolves to null when
/// the senior picks "Continue conversation", or to the edited
/// [VoiceHelpRequest] when they pick "Send request".
Future<VoiceHelpRequest?> showRequestReviewDialog(
  BuildContext context, {
  required VoiceHelpRequest request,
}) {
  return showDialog<VoiceHelpRequest>(
    context: context,
    barrierDismissible: false,
    builder: (_) => RequestReviewDialog(request: request),
  );
}

class RequestReviewDialog extends StatefulWidget {
  const RequestReviewDialog({super.key, required this.request});

  final VoiceHelpRequest request;

  @override
  State<RequestReviewDialog> createState() => _RequestReviewDialogState();
}

class _RequestReviewDialogState extends State<RequestReviewDialog> {
  late String _category;
  late String _priority;
  late final TextEditingController _descriptionCtrl;

  @override
  void initState() {
    super.initState();
    _category = kCategoryLabels.containsKey(widget.request.category)
        ? widget.request.category
        : 'other';
    _priority = widget.request.priority;
    _descriptionCtrl = TextEditingController(text: widget.request.description);
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    super.dispose();
  }

  bool get _canSend => _descriptionCtrl.text.trim().isNotEmpty;

  void _send() {
    if (!_canSend) return;
    Navigator.of(context).pop(
      widget.request.copyWith(
        category: _category,
        description: _descriptionCtrl.text.trim(),
        priority: _priority,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.of(context).size;
    final details = widget.request.details;

    return Dialog(
      backgroundColor: AppColors.cardWhite,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: screen.height * 0.85),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _ReviewHeader(),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _FieldLabel('What do you need?'),
                    _CategoryField(
                      value: _category,
                      onChanged: (v) => setState(() => _category = v),
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel('How soon do you need it?'),
                    _PriorityToggle(
                      value: _priority,
                      onChanged: (v) => setState(() => _priority = v),
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel('In your own words'),
                    TextField(
                      controller: _descriptionCtrl,
                      maxLines: 4,
                      minLines: 2,
                      maxLength: 2000,
                      textCapitalization: TextCapitalization.sentences,
                      style: const TextStyle(
                        fontSize: 15,
                        height: 1.4,
                        color: AppColors.textPrimary,
                      ),
                      onChanged: (_) => setState(() {}),
                      decoration: const InputDecoration(
                        hintText: 'Tell Sahayak what happened…',
                        counterText: '',
                      ),
                    ),
                    if (details != null && details.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      const _FieldLabel('Also noted'),
                      _DetailsList(details: details),
                    ],
                    const SizedBox(height: 18),
                    const _CameraPlaceholder(),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            Container(height: 1, color: AppColors.divider),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  PrimaryButton(
                    label: 'Send request',
                    icon: Icons.send_rounded,
                    onPressed: _canSend ? _send : null,
                  ),
                  const SizedBox(height: 10),
                  PrimaryButton(
                    label: 'Continue conversation',
                    icon: Icons.mic_none_rounded,
                    color: AppColors.senior,
                    outlined: true,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewHeader extends StatelessWidget {
  const _ReviewHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.navyDark,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.accentBlue.withAlpha(38),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.assignment_turned_in_outlined,
              color: Colors.white,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  "Here's what I noted",
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Check it before we send it to a volunteer.',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      ),
    );
  }
}

class _CategoryField extends StatelessWidget {
  const _CategoryField({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      borderRadius: BorderRadius.circular(10),
      icon: const Icon(Icons.expand_more_rounded, color: AppColors.textSecondary),
      style: const TextStyle(fontSize: 15, color: AppColors.textPrimary),
      items: kCategoryLabels.entries
          .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class _PriorityToggle extends StatelessWidget {
  const _PriorityToggle({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _PriorityChip(
            label: 'Normal',
            icon: Icons.schedule_rounded,
            selected: value != 'urgent',
            onTap: () => onChanged('normal'),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _PriorityChip(
            label: 'Urgent',
            icon: Icons.priority_high_rounded,
            selected: value == 'urgent',
            onTap: () => onChanged('urgent'),
          ),
        ),
      ],
    );
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.accentBlue : AppColors.textSecondary;
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: selected ? AppColors.accentBlue.withAlpha(20) : AppColors.cardWhite,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? AppColors.accentBlue : AppColors.divider,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailsList extends StatelessWidget {
  const _DetailsList({required this.details});

  final Map<String, dynamic> details;

  static const Map<String, String> _labels = {
    'items': 'Items',
    'symptom': 'Symptom',
    'destination': 'Going to',
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.scaffold,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: details.entries.map((entry) {
          final value = entry.value is List
              ? (entry.value as List).map((e) => e.toString()).join(', ')
              : entry.value.toString();
          return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              '${_labels[entry.key] ?? entry.key}: $value',
              style: const TextStyle(fontSize: 14, color: AppColors.textPrimary),
            ),
          );
        }).toList(),
      ),
    );
  }
}

/// Photo capture is not wired up yet — the tile is deliberately inert so the
/// rest of the review flow can be built and tested without a camera dependency.
class _CameraPlaceholder extends StatelessWidget {
  const _CameraPlaceholder();

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Photos are not available yet.'),
          ),
        );
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.scaffold,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.photo_camera_outlined,
                color: AppColors.textSecondary,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Add a photo',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Show the volunteer what is wrong',
                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppColors.scaffold,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.divider),
              ),
              child: const Text(
                'Soon',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
