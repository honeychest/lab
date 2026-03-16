package com.chs.springboot.global.tools;

import org.jasypt.encryption.pbe.PooledPBEStringEncryptor;
import org.jasypt.encryption.pbe.config.SimpleStringPBEConfig;

/**
 * Jasypt 암복호화 독립 실행 도구 (서버 없이 실행 가능)
 *
 * 실행 방법 (IntelliJ: main 옆 ▶ 클릭 또는 Run Configuration):
 *   VM options: -DJASYPT_ENCRYPTOR_PASSWORD=마스터비밀번호
 *   Program arguments: enc 암호화할값
 *                   또는 dec ENC(복호화할값)
 *
 * 터미널 실행:
 *   JASYPT_ENCRYPTOR_PASSWORD=비밀번호 ./gradlew run --args="enc 암호화할값"
 */
public class JasyptTool {

    public static void main(String[] args) {
        String password = System.getenv("JASYPT_ENCRYPTOR_PASSWORD");
        if (password == null || password.isBlank()) {
            System.out.println("[ERROR] 환경변수 JASYPT_ENCRYPTOR_PASSWORD 가 설정되지 않았습니다.");
            System.out.println("  IntelliJ VM options: -DJASYPT_ENCRYPTOR_PASSWORD=비밀번호");
            System.exit(1);
        }

        if (args.length < 2) {
            printUsage();
            System.exit(1);
        }

        String mode  = args[0].toLowerCase();
        String value = args[1];

        PooledPBEStringEncryptor encryptor = buildEncryptor(password);

        switch (mode) {
            case "enc" -> {
                String encrypted = encryptor.encrypt(value);
                System.out.println("원문   : " + value);
                System.out.println("암호화 : ENC(" + encrypted + ")");
            }
            case "dec" -> {
                // ENC(...) 래퍼 자동 제거
                String raw = value.startsWith("ENC(") && value.endsWith(")")
                        ? value.substring(4, value.length() - 1)
                        : value;
                String decrypted = encryptor.decrypt(raw);
                System.out.println("암호문 : " + value);
                System.out.println("복호화 : " + decrypted);
            }
            default -> {
                System.out.println("[ERROR] 알 수 없는 명령: " + mode);
                printUsage();
                System.exit(1);
            }
        }
    }

    private static PooledPBEStringEncryptor buildEncryptor(String password) {
        PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
        SimpleStringPBEConfig config = new SimpleStringPBEConfig();
        config.setPassword(password);
        config.setAlgorithm("PBEWithMD5AndDES");
        config.setKeyObtentionIterations("1000");
        config.setPoolSize("1");
        config.setProviderName("SunJCE");
        config.setSaltGeneratorClassName("org.jasypt.salt.RandomSaltGenerator");
        config.setIvGeneratorClassName("org.jasypt.iv.NoIvGenerator");
        config.setStringOutputType("base64");
        encryptor.setConfig(config);
        return encryptor;
    }

    private static void printUsage() {
        System.out.println("사용법:");
        System.out.println("  enc <원문>         → 암호화 후 ENC(...) 출력");
        System.out.println("  dec <ENC(...)>     → 복호화 후 원문 출력");
    }
}
