// Purpose: application.properties의 ENC(...) 암호화 값을 자동 복호화하는 Jasypt 설정

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  application.properties에서 ENC(암호화된문자열) 형태의 값을
 *  Spring 컨텍스트 로딩 시점에 자동으로 복호화하는 설정.
 *
 *  사용 흐름:
 *    1. 개발자가 jasypt CLI로 API 키를 암호화
 *       → ENC(mJ3f8kPq+abc123=) 같은 문자열 생성
 *    2. application.properties에 암호화된 값 저장
 *       weather.api.key=ENC(mJ3f8kPq+abc123=)
 *    3. 마스터 암호는 .env 또는 JVM 옵션으로 전달
 *       -Djasypt.encryptor.password=내비밀번호
 *    4. 앱 시작 시 JasyptConfig가 ENC(...)를 복호화해서 원래 값으로 치환
 *       weather.api.key = "실제_api_key_값"
 *    5. @Value("${weather.api.key}")가 복호화된 값을 주입받음
 *
 *  장점:
 *    - application.properties를 git에 올려도 실제 API 키가 노출되지 않음
 *    - 마스터 암호만 안전하게 관리하면 됨
 *
 *  jQuery 비유:
 *    $.ajax 요청 전 Authorization 헤더에 base64 인코딩된 토큰을 자동 추가하는
 *    $.ajaxSetup()과 유사. "항상 자동으로 처리" 개념.
 *
 *  ⚠ 마스터 암호(-Djasypt.encryptor.password)는 절대 git에 올리지 말 것
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.global;

import com.ulisesbocchio.jasyptspringboot.annotation.EnableEncryptableProperties;
import org.jasypt.encryption.StringEncryptor;
import org.jasypt.encryption.pbe.PooledPBEStringEncryptor;
import org.jasypt.encryption.pbe.config.SimpleStringPBEConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * @Configuration: Spring 설정 클래스로 등록.
 *
 * @EnableEncryptableProperties:
 *   jasypt-spring-boot 라이브러리의 핵심 어노테이션.
 *   이 어노테이션이 있어야 Spring이 ENC(...) 패턴을 감지하고
 *   자동으로 복호화 처리를 수행함.
 *   없으면 ENC(...)가 그냥 문자열 그대로 주입됨.
 */
@Configuration
@EnableEncryptableProperties
public class JasyptConfig {

    /**
     * stringEncryptor: Jasypt 복호화 엔진 Bean.
     *
     * @Bean("jasyptStringEncryptor"):
     *   Spring 컨테이너에 "jasyptStringEncryptor" 라는 이름으로 빈 등록.
     *   jasypt-spring-boot는 기본적으로 "jasyptStringEncryptor" 이름의 빈을 찾음.
     *   이름이 다르면 @EncryptablePropertySource에 별도 지정 필요.
     *
     * StringEncryptor (인터페이스):
     *   encrypt(String), decrypt(String) 메서드 정의.
     *   PooledPBEStringEncryptor가 실제 구현체.
     *
     * PooledPBEStringEncryptor:
     *   PBE(Password-Based Encryption) 방식의 암호화기.
     *   "Pooled" = 내부적으로 여러 암호화기 인스턴스를 풀(pool)로 관리해서
     *   멀티스레드 환경에서 성능 최적화.
     *   프로퍼티 수가 많아도 동시에 안전하게 복호화 가능.
     *
     * SimpleStringPBEConfig:
     *   암호화 설정값들을 담는 컨테이너 객체.
     *   각 setXxx() 메서드로 옵션 세팅 후 encryptor.setConfig(config)로 전달.
     */
    @Bean("jasyptStringEncryptor")
    public StringEncryptor stringEncryptor() {
        PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
        SimpleStringPBEConfig config = new SimpleStringPBEConfig();

        /**
         * config.setPassword: 복호화에 사용할 마스터 암호 설정.
         *
         * System.getProperty("jasypt.encryptor.password"):
         *   JVM 시스템 프로퍼티에서 마스터 암호를 읽음.
         *   DotenvConfig가 .env 파일을 읽어 System.setProperty로 등록해둠.
         *   또는 직접 JVM 옵션으로 전달:
         *     java -Djasypt.encryptor.password=내비밀번호 -jar app.jar
         *
         *   왜 @Value가 아닌 System.getProperty()를 쓰나?
         *   JasyptConfig는 Spring 컨텍스트 초기화 초기에 실행되어야 함.
         *   @Value 주입은 그보다 늦은 시점 → null 위험.
         *   System.getProperty()는 JVM 레벨 저장소라 항상 바로 읽을 수 있음.
         */
        // 실행 시 환경변수나 VM 옵션으로 넘길 '마스터 암호'
        // -Djasypt.encryptor.password=내비밀번호
        config.setPassword(System.getenv("JASYPT_ENCRYPTOR_PASSWORD"));

        /**
         * setAlgorithm: 암복호화 알고리즘.
         *   "PBEWithMD5AndDES":
         *     PBE(Password-Based Encryption) + MD5 해시 + DES 대칭 암호화 조합.
         *     Jasypt의 기본 알고리즘. 구현이 단순하고 Java 기본 JCE 라이브러리만 필요.
         *     보안 강도 측면에서 최신 알고리즘(AES256)보다 약하지만,
         *     내부 API 키 관리 수준에서는 충분.
         *     더 강한 보안이 필요하면 "PBEWITHHMACSHA512ANDAES_256" 사용.
         */
        config.setAlgorithm("PBEWithMD5AndDES"); // 기본 알고리즘

        /**
         * setKeyObtentionIterations: 키 도출 반복 횟수.
         *   암호를 해싱할 때 1000번 반복 적용 → 브루트포스 공격 속도 저하.
         *   숫자가 클수록 보안 강화, 앱 시작 속도 소폭 감소.
         *   Jasypt 기본값도 1000.
         */
        config.setKeyObtentionIterations("1000"); // 반복 횟수

        /**
         * setPoolSize: 암호화기 풀 크기.
         *   "1" = 인스턴스 1개.
         *   프로퍼티 수가 적고 동시 복호화 요구가 낮으므로 1로 충분.
         *   고부하 환경에서는 CPU 코어 수에 맞게 늘릴 수 있음.
         */
        config.setPoolSize("1");

        /**
         * setProviderName: JCE(Java Cryptography Extension) 프로바이더.
         *   "SunJCE" = Java 기본 내장 암호화 라이브러리.
         *   별도 설치 없이 JDK에 포함되어 있어서 이식성이 좋음.
         *   BouncyCastle 같은 외부 프로바이더를 쓰면 더 많은 알고리즘 사용 가능.
         */
        config.setProviderName("SunJCE");

        /**
         * setSaltGeneratorClassName: 솔트(Salt) 생성기 클래스.
         *   솔트란? 암호화 시 매번 다른 무작위 값을 섞어서
         *   동일한 원문이 매번 다른 암호문이 되게 하는 기법.
         *   "RandomSaltGenerator" = 매 암호화마다 무작위 솔트 생성.
         *   같은 API 키를 두 번 암호화해도 결과가 다름 → 레인보우 테이블 공격 방어.
         */
        config.setSaltGeneratorClassName("org.jasypt.salt.RandomSaltGenerator");

        /**
         * setIvGeneratorClassName: IV(Initialization Vector) 생성기.
         *   IV는 CBC(Cipher Block Chaining) 모드에서 첫 블록 암호화에 사용.
         *   "NoIvGenerator" = PBEWithMD5AndDES는 IV가 필요 없는 방식이므로
         *   IV를 사용하지 않음.
         *   AES-CBC 알고리즘으로 변경하면 RandomIvGenerator가 필요.
         */
        config.setIvGeneratorClassName("org.jasypt.iv.NoIvGenerator");

        /**
         * setStringOutputType: 암호화 결과물의 인코딩 방식.
         *   "base64" = 암호화된 바이너리를 Base64 문자열로 인코딩.
         *   application.properties에는 텍스트만 저장 가능하므로
         *   바이너리를 텍스트로 변환하기 위해 Base64 사용.
         *   결과: ENC(base64인코딩된문자열)
         */
        config.setStringOutputType("base64");

        encryptor.setConfig(config);
        return encryptor;
    }
}
