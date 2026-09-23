import 'package:flutter/material.dart';

/// Single source of truth for all brand colors.
/// Values are aligned with the Sahayak Admin web portal.
class AppColors {
  AppColors._();

  // ── Brand / nav ──────────────────────────────────────────────────────────
  static const Color navyDark = Color(0xFF1A2035);     // sidebar background
  static const Color navyMid  = Color(0xFF212842);     // card/header tint
  static const Color navyLight = Color(0xFF2C3555);    // hover / selected row

  // ── Accent ───────────────────────────────────────────────────────────────
  static const Color accentBlue   = Color(0xFF3B82F6); // primary CTA / links
  static const Color accentIndigo = Color(0xFF3B4CCA); // auth brand (kept)

  // ── Semantic ─────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF22C55E); // APPROVED / low priority
  static const Color warning = Color(0xFFF59E0B); // PENDING  / medium priority
  static const Color error   = Color(0xFFEF4444); // REJECTED / high priority

  // ── Role colours ─────────────────────────────────────────────────────────
  static const Color volunteer = Color(0xFF1E7A4C);
  static const Color senior    = Color(0xFFB0432E);

  // ── Surface / background ─────────────────────────────────────────────────
  static const Color scaffold  = Color(0xFFF1F5F9);
  static const Color cardWhite = Color(0xFFFFFFFF);
  static const Color divider   = Color(0xFFE2E8F0);

  // ── Text ─────────────────────────────────────────────────────────────────
  static const Color textPrimary   = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textOnDark    = Color(0xFFFFFFFF);
}
