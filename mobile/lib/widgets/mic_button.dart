import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// The conversation FSM state that drives mic button appearance.
enum ConversationState {
  idle,
  listening,
  transcribing,
  awaitingReply,
  error,
}

/// Self-contained animated mic button.
///
/// The button appearance and pulsing animation adapt to [state].
/// It does NOT hold state itself — the parent drives it via [state].
class MicButton extends StatefulWidget {
  const MicButton({
    super.key,
    required this.state,
    required this.onTap,
  });

  final ConversationState state;

  /// Called when the user taps the button.  The parent decides what to do
  /// based on the current [state].
  final VoidCallback? onTap;

  @override
  State<MicButton> createState() => _MicButtonState();
}

class _MicButtonState extends State<MicButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _scale = Tween<double>(begin: 1.0, end: 1.18).animate(
      CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
    );
    _syncAnimation();
  }

  @override
  void didUpdateWidget(covariant MicButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state) {
      _syncAnimation();
    }
  }

  void _syncAnimation() {
    if (widget.state == ConversationState.listening) {
      _pulse.repeat(reverse: true);
    } else {
      _pulse.stop();
      _pulse.reset();
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDisabled = widget.state == ConversationState.awaitingReply ||
        widget.state == ConversationState.transcribing;

    final Color color;
    final IconData icon;
    String label;

    switch (widget.state) {
      case ConversationState.idle:
      case ConversationState.error:
        color = AppColors.accentBlue;
        icon = Icons.mic;
        label = 'Tap to speak';
      case ConversationState.listening:
        color = AppColors.error;
        icon = Icons.stop_rounded;
        label = 'Listening…';
      case ConversationState.transcribing:
        color = AppColors.warning;
        icon = Icons.hourglass_top_rounded;
        label = 'Processing…';
      case ConversationState.awaitingReply:
        color = AppColors.textSecondary;
        icon = Icons.mic;
        label = 'Waiting for reply…';
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: isDisabled ? null : widget.onTap,
          child: ScaleTransition(
            scale: _scale,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isDisabled ? color.withAlpha(120) : color,
                boxShadow: isDisabled
                    ? []
                    : [
                        BoxShadow(
                          color: color.withAlpha(80),
                          blurRadius: 20,
                          spreadRadius: 4,
                        ),
                      ],
              ),
              child: Icon(icon, color: Colors.white, size: 34),
            ),
          ),
        ),
        const SizedBox(height: 10),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: Text(
            label,
            key: ValueKey(label),
            style: TextStyle(
              color: widget.state == ConversationState.listening
                  ? AppColors.error
                  : AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
