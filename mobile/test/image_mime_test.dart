import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sahayak_mobile/services/image_type.dart';
import 'package:sahayak_mobile/services/voice_payload.dart';

/// Bytes that identify a file as what we claim it is, with no extension and no
/// declared type — exactly the situation `image_picker` leaves Android in.
const List<int> kPngBytes = [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
];
const List<int> kJpegBytes = [
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
];
const List<int> kWebpBytes = [
  0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];
const List<int> kHeicBytes = [
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
];

void main() {
  late Directory dir;

  setUp(() => dir = Directory.systemTemp.createTempSync('image_type_test'));
  tearDown(() => dir.deleteSync(recursive: true));

  String write(String name, List<int> bytes) {
    final f = File('${dir.path}/$name')..writeAsBytesSync(bytes);
    return f.path;
  }

  group('detectImageMimeTypeFromBytes', () {
    test('identifies each supported type from its signature alone', () {
      expect(detectImageMimeTypeFromBytes(write('a', kPngBytes)), 'image/png');
      expect(detectImageMimeTypeFromBytes(write('b', kJpegBytes)), 'image/jpeg');
      expect(detectImageMimeTypeFromBytes(write('c', kWebpBytes)), 'image/webp');
    });

    test('identifies HEIC so it can be reported rather than mislabelled', () {
      expect(detectImageMimeTypeFromBytes(write('d', kHeicBytes)), 'image/heic');
    });

    test('returns null for a file that is not an image', () {
      expect(
        detectImageMimeTypeFromBytes(write('e', 'hello'.codeUnits)),
        isNull,
      );
    });

    test('returns null for a path that does not exist', () {
      expect(detectImageMimeTypeFromBytes('${dir.path}/missing.png'), isNull);
    });
  });

  group('resolveImageMimeType', () {
    test('uses the bytes when the cached copy has no usable extension', () {
      // The real failure: `image_picker` hands back a cache path like
      // `.../image_picker1234567890` and Android reports no type, so a PNG
      // used to be turned away by a name check alone.
      final path = write('image_picker1234567890', kPngBytes);
      expect(path.endsWith('.png'), isFalse);
      expect(resolveImageMimeType(path), 'image/png');
    });

    test('trusts a real declared type', () {
      expect(
        resolveImageMimeType(
          write('x', kJpegBytes),
          declaredMimeType: 'image/png',
        ),
        'image/png',
      );
    });

    test('normalizes image/jpg, which is not a real MIME type', () {
      expect(
        resolveImageMimeType('/tmp/whatever', declaredMimeType: 'image/jpg'),
        'image/jpeg',
      );
    });

    test('ignores parameters on the declared type', () {
      expect(
        resolveImageMimeType(
          '/tmp/whatever',
          declaredMimeType: 'image/png; charset=binary',
        ),
        'image/png',
      );
    });

    test('rejects a declared image type the backend will not take', () {
      expect(
        resolveImageMimeType('/tmp/p', declaredMimeType: 'image/heic'),
        isNull,
      );
      expect(
        resolveImageMimeType('/tmp/p', declaredMimeType: 'image/gif'),
        isNull,
      );
    });

    test('believes the bytes over an unsupported declared type', () {
      // iOS re-encodes the picked copy to JPEG because `imageQuality` is set,
      // but keeps reporting the original format on `XFile.mimeType`. Trusting
      // the declaration here turns away a file that uploads perfectly well.
      final path = write('image_picker999', kJpegBytes);
      expect(
        resolveImageMimeType(path, declaredMimeType: 'image/heic'),
        'image/jpeg',
      );
    });

    test('still rejects HEIC when the bytes agree it is HEIC', () {
      // The fix above must not become a way through for a real HEIC: here the
      // declaration and the signature both say so, and the file is even named
      // `.jpg` to prove the extension cannot talk the way out of it.
      final path = write('photo.jpg', kHeicBytes);
      expect(resolveImageMimeType(path, declaredMimeType: 'image/heic'), isNull);
      expect(resolveImageMimeType(path), isNull);
    });

    test('rejects a HEIC found by signature, not by name', () {
      expect(resolveImageMimeType(write('photo.png', kHeicBytes)), isNull);
    });

    test('falls through an unhelpful declared type to the bytes', () {
      // `application/octet-stream` is what a picker reports when it could not
      // work the type out, so it must not veto a perfectly readable PNG.
      expect(
        resolveImageMimeType(
          write('f', kPngBytes),
          declaredMimeType: 'application/octet-stream',
        ),
        'image/png',
      );
    });

    test('falls back to the extension when the file cannot be read', () {
      expect(resolveImageMimeType('/tmp/holiday.png'), 'image/png');
      expect(resolveImageMimeType('/tmp/holiday.webp'), 'image/webp');
      expect(resolveImageMimeType('/tmp/holiday.jpg'), 'image/jpeg');
      expect(resolveImageMimeType('/tmp/holiday.JPEG'), 'image/jpeg');
    });

    test('returns null only when there is no signal at all', () {
      expect(resolveImageMimeType('/tmp/noextension'), isNull);
      expect(resolveImageMimeType('/tmp/trailingdot.'), isNull);
      expect(resolveImageMimeType('/tmp/notes.txt'), isNull);
    });
  });

  group('VoiceHelpRequest image fields', () {
    VoiceHelpRequest base() => const VoiceHelpRequest(
          requestId: 'r1',
          category: 'medical_assistance',
          description: 'Need my tablets',
        );

    test('carries the path and the type together', () {
      final withImage = base().copyWith(
        imagePath: '/cache/abc',
        imageMimeType: 'image/png',
      );
      expect(withImage.imagePath, '/cache/abc');
      expect(withImage.imageMimeType, 'image/png');
    });

    test('clearing the photo clears its type too', () {
      final withImage = base().copyWith(
        imagePath: '/cache/abc',
        imageMimeType: 'image/png',
      );
      final cleared = withImage.copyWith(clearImage: true);
      expect(cleared.imagePath, isNull);
      // A stale type left behind would be sent as the part's Content-Type for
      // a photo that no longer exists.
      expect(cleared.imageMimeType, isNull);
    });

    test('leaves the photo out of the create body', () {
      final withImage = base().copyWith(
        imagePath: '/cache/abc',
        imageMimeType: 'image/png',
      );
      final body = withImage.toCreateBody(latitude: 12.97, longitude: 77.59);
      expect(body.containsKey('imagePath'), isFalse);
      expect(body.containsKey('image_path'), isFalse);
      expect(body.containsKey('imageMimeType'), isFalse);
      expect(body.containsKey('image_mime_type'), isFalse);
    });
  });
}
