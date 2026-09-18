import 'package:flutter/material.dart';

/// Central place for app-wide styling so screens stay consistent.
/// Colors loosely follow the legend in the client page-flow doc:
/// purple = auth, green = volunteer, red = senior citizen, blue = post-registration.
class AppTheme {
  static const Color primary = Color(0xFF3B4CCA); // auth / brand
  static const Color volunteer = Color(0xFF1E7A4C);
  static const Color senior = Color(0xFFB0432E);
  static const Color postRegistration = Color(0xFF1E5FA6);

  static ThemeData get light {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: primary,
      scaffoldBackgroundColor: const Color(0xFFF7F7FA),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}
