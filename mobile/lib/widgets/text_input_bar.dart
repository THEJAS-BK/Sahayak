import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

// Re-export so screens only need to import text_input_bar.dart for both widgets.
export 'mic_button.dart' show MicButton, ConversationState;

/// Bottom bar with an expandable [TextField] and a Send button.
///
/// Used for both free-form text input and correcting a voice transcription.
/// [isBusy] disables the Send button while a reply is in flight.
class TextInputBar extends StatelessWidget {
  const TextInputBar({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.onSend,
    this.isBusy = false,
    this.hintText = 'Type a message…',
    this.helperText,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  final bool isBusy;
  final String hintText;

  /// Optional helper text shown below the field (e.g., "Couldn't hear you —
  /// type your message").
  final String? helperText;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: const BoxDecoration(
        color: AppColors.cardWhite,
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (helperText != null) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 6, left: 4),
              child: Text(
                helperText!,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.warning,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // ── Text field ──────────────────────────────────────────────
              Expanded(
                child: Container(
                  constraints: const BoxConstraints(maxHeight: 120),
                  decoration: BoxDecoration(
                    color: AppColors.scaffold,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    maxLines: null,
                    textCapitalization: TextCapitalization.sentences,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.textPrimary,
                    ),
                    decoration: InputDecoration(
                      hintText: hintText,
                      hintStyle: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 14,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                    ),
                    onSubmitted: isBusy ? null : (_) => onSend(),
                    enabled: !isBusy,
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // ── Send button ─────────────────────────────────────────────
              AnimatedOpacity(
                opacity: isBusy ? 0.4 : 1.0,
                duration: const Duration(milliseconds: 200),
                child: SizedBox(
                  width: 44,
                  height: 44,
                  child: Material(
                    color: AppColors.accentBlue,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: isBusy ? null : onSend,
                      child: const Icon(
                        Icons.send_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
