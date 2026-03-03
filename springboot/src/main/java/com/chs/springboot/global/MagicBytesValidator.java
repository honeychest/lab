package com.chs.springboot.global;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

/**
 * 파일 Magic Bytes 검증 유틸리티.
 * 확장자나 Content-Type은 클라이언트가 위조 가능하므로
 * 파일 첫 바이트로 실제 형식을 확인한다.
 */
public class MagicBytesValidator {

    // JPEG: FF D8 FF
    private static final byte[] JPEG = { (byte)0xFF, (byte)0xD8, (byte)0xFF };
    // PNG:  89 50 4E 47 0D 0A 1A 0A
    private static final byte[] PNG  = { (byte)0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
    // GIF:  47 49 46 38
    private static final byte[] GIF  = { 0x47, 0x49, 0x46, 0x38 };
    // WEBP: RIFF(4바이트) + 크기(4바이트) + WEBP(4바이트)
    private static final byte[] RIFF = { 0x52, 0x49, 0x46, 0x46 };
    private static final byte[] WEBP = { 0x57, 0x45, 0x42, 0x50 };

    public static boolean isValidImage(MultipartFile file) throws IOException {
        byte[] header = new byte[12];
        try (InputStream is = file.getInputStream()) {
            if (is.read(header) < 12) return false;
        }

        if (startsWith(header, JPEG)) return true;
        if (startsWith(header, PNG))  return true;
        if (startsWith(header, GIF))  return true;
        // WEBP: 오프셋 0에 RIFF, 오프셋 8에 WEBP
        if (startsWith(header, RIFF) && subArrayEquals(header, 8, WEBP)) return true;

        return false;
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    private static boolean subArrayEquals(byte[] data, int offset, byte[] target) {
        if (data.length < offset + target.length) return false;
        for (int i = 0; i < target.length; i++) {
            if (data[offset + i] != target[i]) return false;
        }
        return true;
    }
}
