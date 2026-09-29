import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/config/app_config.dart';
import 'package:sahayak_mobile/screens/senior_registration_screen.dart';
import 'package:sahayak_mobile/screens/volunteer_registration_screen.dart';

/// Both registration forms must open with the same coordinates prefilled.
/// A senior and a volunteer created through the app then sit on one point, so
/// any request is inside the backend's MATCH_RADIUS_M without hand-typing.
void main() {
  /// The location card sits at the bottom of both forms' ListViews, so it is
  /// not built until it is scrolled into view.
  Future<String?> fieldText(WidgetTester tester, String label) async {
    final finder = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == label,
    );
    if (finder.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        finder,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
    }
    return tester.widgetList<TextField>(finder).first.controller?.text;
  }

  testWidgets('senior form prefills the shared default location',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SeniorRegistrationScreen()));
    await tester.pumpAndSettle();

    expect(
      await fieldText(tester, 'Latitude'),
      '${AppConfig.defaultLatitude}',
    );
    expect(
      await fieldText(tester, 'Longitude'),
      '${AppConfig.defaultLongitude}',
    );
  });

  testWidgets('volunteer form prefills the shared default location',
      (tester) async {
    await tester
        .pumpWidget(const MaterialApp(home: VolunteerRegistrationScreen()));
    await tester.pumpAndSettle();

    expect(
      await fieldText(tester, 'Latitude'),
      '${AppConfig.defaultLatitude}',
    );
    expect(
      await fieldText(tester, 'Longitude'),
      '${AppConfig.defaultLongitude}',
    );
  });

  test('the default is a point both roles share, inside the match radius',
      () {
    // Identical on both sides, so the distance is 0 m and matching cannot
    // depend on the radius being generous.
    expect(AppConfig.defaultLatitude, isNotNull);
    expect(AppConfig.defaultLongitude, isNotNull);
    // Valid coordinates, or the backend's zod schema rejects the form.
    expect(AppConfig.defaultLatitude, inInclusiveRange(-90, 90));
    expect(AppConfig.defaultLongitude, inInclusiveRange(-180, 180));
  });
}
