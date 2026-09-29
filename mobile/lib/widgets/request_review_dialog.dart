import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/image_type.dart';
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

  /// Local path of the photo the senior picked, or null. Not uploaded from
  /// here — see [_PhotoTile].
  String? _imagePath;
  String? _imageMimeType;

  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _category = kCategoryLabels.containsKey(widget.request.category)
        ? widget.request.category
        : 'other';
    _priority = widget.request.priority;
    _descriptionCtrl = TextEditingController(text: widget.request.description);
    _imagePath = widget.request.imagePath;
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    super.dispose();
  }

  bool get _canSend => _descriptionCtrl.text.trim().isNotEmpty;

  Future<void> _pick(ImageSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source,
        // Cap the long edge here so an 8 MB phone camera original never becomes
        // a failed upload; the server caps at 5 MB and Cloudinary downsizes to
        // 1000px anyway.
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      if (picked == null || !mounted) return;

      // `picked.mimeType` is what the platform read off the file. The picked
      // copy lands in the picker's cache under a name that often has no usable
      // extension, so trusting the name alone rejects valid PNGs.
      final mime = resolveImageMimeType(
        picked.path,
        declaredMimeType: picked.mimeType,
      );
      if (mime == null) {
        _notify('That file is not a JPEG, PNG or WebP image.');
        return;
      }

      setState(() {
        _imagePath = picked.path;
        _imageMimeType = mime;
      });
    } catch (e) {
      _notify('Could not open that photo. Check camera and photo permissions.');
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _send() {
    if (!_canSend) return;
    Navigator.of(context).pop(
      widget.request.copyWith(
        category: _category,
        description: _descriptionCtrl.text.trim(),
        priority: _priority,
        imagePath: _imagePath,
        imageMimeType: _imageMimeType,
        clearImage: _imagePath == null,
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
                    _PhotoTile(
                      imagePath: _imagePath,
                      onPick: _pick,
                      onClear: () => setState(() {
                        _imagePath = null;
                        _imageMimeType = null;
                      }),
                    ),
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

/// Photo tile for the review sheet: opens the camera or the gallery, shows a
/// thumbnail of what was picked, and lets it be replaced or removed.
///
/// The picked file stays on disk until the request is actually sent — nothing
/// is uploaded from here, because the upload needs the request id that
/// `POST /api/requests` has not returned yet. The path rides along on
/// [VoiceHelpRequest.imagePath] and the conversation screen sends it afterwards.
class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.imagePath, required this.onPick, required this.onClear});

  /// Local file path of the current selection, or null when there is none.
  final String? imagePath;

  final Future<void> Function(ImageSource source) onPick;
  final VoidCallback onClear;

  Future<void> _choose(BuildContext context) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.cardWhite,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: AppColors.textPrimary),
              title: const Text('Take a photo'),
              subtitle: const Text('Use the camera now'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: AppColors.textPrimary),
              title: const Text('Choose from gallery'),
              subtitle: const Text('Pick a photo you already took'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) await onPick(source);
  }

  @override
  Widget build(BuildContext context) {
    final path = imagePath;

    if (path != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _FieldLabel('Photo'),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Image.file(
                File(path),
                fit: BoxFit.cover,
                // The file is local and known to exist, so a broken decode means
                // the senior deleted or moved it — say so rather than showing
                // an empty grey box.
                errorBuilder: (_, __, ___) => Container(
                  color: AppColors.scaffold,
                  alignment: Alignment.center,
                  child: const Text(
                    'That photo could not be opened.',
                    style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _choose(context),
                  icon: const Icon(Icons.swap_horiz, size: 16),
                  label: const Text('Change'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.accentBlue,
                    side: const BorderSide(color: AppColors.divider),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onClear,
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Remove'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textSecondary,
                    side: const BorderSide(color: AppColors.divider),
                  ),
                ),
              ),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => _choose(context),
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
                    'Optional',
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
        ),
      ],
    );
  }
}
