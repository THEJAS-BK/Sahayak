import 'dart:io';
import 'dart:typed_data';

/// Deciding what an image "really is" before it is uploaded to
/// `POST /api/requests/:id/photo`.
///
/// The backend only accepts JPEG, PNG and WebP and checks the MIME type on the
/// multipart part, so the client has to name the part correctly. Guessing from
/// the file name is not good enough: `image_picker` copies the picked image
/// into its own cache directory, and on Android the copy is frequently named
/// without a usable extension. The bytes are the only reliable answer, so the
/// file signature is checked before falling back to the name.

/// Image types the backend accepts, in their canonical spelling.
const Set<String> kAcceptedImageMimeTypes = {
  'image/jpeg',
  'image/png',
  'image/webp',
};

/// Real image types the backend will not take.
///
/// Listed separately so a definite "this is a HEIC" is answered with a clear
/// message instead of being second-guessed against the file name.
const Set<String> kOtherImageMimeTypes = {
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
  'image/svg+xml',
};

const Map<String, String> kImageMimeTypesByExtension = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'webp': 'image/webp',
};

/// Reads the file's signature and reports the image type it encodes, or null
/// if it is not one of the types this app cares about.
///
/// Deliberately tolerant: any file that cannot be read, or that is truncated
/// below the bytes needed, returns null so the caller can try the file name.
String? detectImageMimeTypeFromBytes(String filePath) {
  final RandomAccessFile? handle;
  try {
    handle = File(filePath).openSync();
  } on FileSystemException {
    return null;
  }
  try {
    final head = handle.readSync(16);
    if (head.length < 4) return null;
    return _mimeTypeOfSignature(head);
  } on FileSystemException {
    return null;
  } finally {
    handle.closeSync();
  }
}

String? _mimeTypeOfSignature(Uint8List b) {
  // PNG: \x89 P N G \r \n \x1a \n
  if (b.length >= 8 &&
      b[0] == 0x89 &&
      b[1] == 0x50 &&
      b[2] == 0x4E &&
      b[3] == 0x47 &&
      b[4] == 0x0D &&
      b[5] == 0x0A &&
      b[6] == 0x1A &&
      b[7] == 0x0A) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) {
    return 'image/jpeg';
  }

  if (b.length >= 4 &&
      b[0] == 0x52 && // R
      b[1] == 0x49 && // I
      b[2] == 0x46 && // F
      b[3] == 0x46) {
    // F
    // WEBP: "RIFF" <4 bytes size> "WEBP"
    if (b.length >= 12 &&
        b[8] == 0x57 && // W
        b[9] == 0x45 && // E
        b[10] == 0x42 && // B
        b[11] == 0x50) {
      // P
      return 'image/webp';
    }
    return null;
  }

  // ISO base media (HEIC/HEIF/AVIF and friends): <4 bytes size> "ftyp" <brand>
  if (b.length >= 12 &&
      b[4] == 0x66 && // f
      b[5] == 0x74 && // t
      b[6] == 0x79 && // y
      b[7] == 0x70) {
    // p
    final brand = String.fromCharCodes(b.sublist(8, 12)).toLowerCase();
    if (brand.startsWith('he') || brand == 'mif1' || brand == 'msf1') {
      return 'image/heic';
    }
    if (brand == 'avif' || brand == 'avis') return 'image/avif';
    return null;
  }

  return null;
}

/// The canonical MIME type to upload [filePath] as, or null when the backend
/// would reject it.
///
/// [declaredMimeType] is what the platform reported the file to be. It is
/// trusted when it is a real type, because it costs nothing; note that
/// `image_picker` on Android returns an `XFile` with no type at all, so this
/// is often null and the signature check below is what actually decides.
///
/// `image/jpg` is normalized to `image/jpeg` throughout because both spellings
/// are in use and only the second is a real type.
String? resolveImageMimeType(
  String filePath, {
  String? declaredMimeType,
}) {
  final declared = _canonical(declaredMimeType);
  if (declared != null) {
    if (kAcceptedImageMimeTypes.contains(declared)) return declared;
    // A definite image type we do not accept. Re-encoding on device is out of
    // scope, so report it instead of uploading and taking a 400.
    if (kOtherImageMimeTypes.contains(declared)) return null;
    // Anything else (`application/octet-stream`, a vendor string) says nothing
    // useful about the content, so keep looking.
  }

  final sniffed = _canonical(detectImageMimeTypeFromBytes(filePath));
  if (sniffed != null) {
    if (kAcceptedImageMimeTypes.contains(sniffed)) return sniffed;
    if (kOtherImageMimeTypes.contains(sniffed)) return null;
  }

  final dot = filePath.lastIndexOf('.');
  if (dot < 0 || dot == filePath.length - 1) return null;
  return _canonical(kImageMimeTypesByExtension[filePath.substring(dot + 1).toLowerCase()]);
}

String? _canonical(String? mimeType) {
  if (mimeType == null) return null;
  // Strip any parameters, e.g. "image/png; charset=binary".
  final value = mimeType.split(';').first.trim().toLowerCase();
  if (value.isEmpty) return null;
  return value == 'image/jpg' ? 'image/jpeg' : value;
}
