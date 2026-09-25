import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Branded AppBar matching the web portal header:
/// shield icon + "Sahayak" wordmark, optional notification bell, avatar.
class SahayakAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? subtitle;
  final bool showActions;
  final List<Widget>? extraActions;

  /// If provided, the bell icon will show a red badge with this count and
  /// call this callback when tapped.
  final int notificationCount;
  final VoidCallback? onNotificationTap;

  const SahayakAppBar({
    super.key,
    this.subtitle,
    this.showActions = true,
    this.extraActions,
    this.notificationCount = 0,
    this.onNotificationTap,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: AppColors.navyDark,
      elevation: 0,
      titleSpacing: 12,
      leading: const Padding(
        padding: EdgeInsets.only(left: 12),
        child: Icon(Icons.shield, color: AppColors.accentBlue, size: 28),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'Sahayak',
            style: TextStyle(
              color: AppColors.textOnDark,
              fontSize: 17,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
          if (subtitle != null)
            Text(
              subtitle!,
              style: const TextStyle(
                color: Color(0xFF94A3B8),
                fontSize: 11,
                fontWeight: FontWeight.w400,
              ),
            ),
        ],
      ),
      actions: showActions
          ? [
              ...?extraActions,
              // Bell with optional badge
              Stack(
                alignment: Alignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.notifications_outlined, size: 22),
                    color: const Color(0xFF94A3B8),
                    onPressed: onNotificationTap,
                  ),
                  if (notificationCount > 0)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: IgnorePointer(
                        child: Container(
                          width: 16,
                          height: 16,
                          decoration: const BoxDecoration(
                            color: AppColors.error,
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              '$notificationCount',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.only(right: 12),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.accentBlue,
                  child: Text(
                    'U',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ]
          : null,
    );
  }
}
