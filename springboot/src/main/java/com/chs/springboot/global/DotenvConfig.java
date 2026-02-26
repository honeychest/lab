// Purpose: .env 파일의 환경변수를 JVM 시스템 프로퍼티에 등록하는 설정 클래스

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  프로젝트 루트의 .env 파일을 읽어서
 *  각 KEY=VALUE 를 JVM 시스템 프로퍼티(System.setProperty)에 등록.
 *
 *  왜 시스템 프로퍼티에 등록하나?
 *    - application.properties에서 ${KEY} 치환 가능
 *    - 런타임 코드에서 System.getProperty("KEY")로 언제든지 조회 가능
 *    - WeatherScheduler, JasyptConfig 등이 이 방식으로 값을 읽음
 *
 *  .env 파일 예시:
 *    WEATHER_API_KEY=abc123
 *    SCHEDULING_ENABLED=false
 *    jasypt.encryptor.password=mypassword
 *
 *  jQuery 비유:
 *    .env 파일을 읽는 것은 프론트엔드에서 localStorage.getItem() 전에
 *    localStorage.setItem()으로 값을 저장해두는 것과 유사.
 *    한 번 init()이 실행되면 이후 어디서든 System.getProperty()로 꺼낼 수 있음.
 *
 *  ⚠ .env 파일은 절대 git에 커밋하지 말 것 (.gitignore에 포함시킬 것)
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.global;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.context.annotation.Configuration;
import jakarta.annotation.PostConstruct;

/**
 * @Configuration: Spring 컨텍스트 시작 시 이 클래스를 설정 클래스로 인식.
 *   내부 @Bean 메서드가 없어도 @PostConstruct를 동작시키기 위해 필요.
 *
 * Spring 초기화 순서:
 *   1. @Configuration 클래스 인스턴스 생성
 *   2. @PostConstruct 메서드 실행 (빈 생성 직후, 의존성 주입 완료 후)
 *   3. 나머지 @Value, @ConditionalOnProperty 등 평가
 *   ※ DotenvConfig가 다른 빈보다 먼저 초기화되어야 .env 값이 정상 주입됨
 */
@Configuration
public class DotenvConfig {

    /**
     * init: 애플리케이션 시작 시 .env 파일을 읽어 시스템 프로퍼티에 등록.
     *
     * @PostConstruct:
     *   Spring이 이 빈을 생성한 직후 자동으로 이 메서드를 한 번 호출.
     *   생성자보다 나중, 실제 요청 처리보다 훨씬 이전 시점에 실행됨.
     *   jQuery의 $(document).ready() 와 유사한 개념 (준비 완료 후 단 한 번 실행).
     *
     * Dotenv.configure() 체이닝 옵션 설명:
     *
     *   .directory("./")
     *     .env 파일을 찾을 디렉토리 경로. "./" = JVM 실행 위치(프로젝트 루트).
     *     IDE에서 실행하면 프로젝트 루트, 서버에서 실행하면 JAR 파일이 있는 디렉토리.
     *
     *   .ignoreIfMalformed()
     *     잘못된 형식의 줄(예: KEY 없이 =VALUE)이 있어도 예외 없이 건너뜀.
     *     없으면 형식 오류 시 애플리케이션 시작 실패.
     *
     *   .ignoreIfMissing()
     *     .env 파일이 없어도 예외 없이 진행.
     *     없으면 파일 없을 때 FileNotFoundException → 앱 시작 실패.
     *     운영 서버에서는 .env 대신 실제 OS 환경변수를 쓸 수 있으므로 필수 옵션.
     *
     *   .load()
     *     파일을 실제로 읽어 Dotenv 객체 반환.
     *
     * dotenv.entries().forEach:
     *   모든 KEY=VALUE 쌍을 순회.
     *   jQuery: $.each(entries, function(i, entry) { ... }) 와 같은 구조.
     *
     * System.getProperty(entry.getKey()) == null 체크:
     *   이미 시스템 프로퍼티에 설정된 값이 있으면 덮어쓰지 않음.
     *   이유: -Djasypt.encryptor.password=... 처럼 JVM 옵션으로 직접 넘긴 값이
     *   .env 값에 의해 덮어쓰이는 것을 방지.
     *   우선순위: JVM 옵션(-D) > .env 파일
     *
     * System.setProperty(key, value):
     *   JVM 전역 프로퍼티 저장소에 KEY=VALUE 등록.
     *   이후 어디서든 System.getProperty("KEY")로 읽을 수 있음.
     *   Spring의 Environment, @Value와는 별개의 저장소이지만
     *   Spring도 내부적으로 System Properties를 읽을 수 있음.
     */
    @PostConstruct
    public void init() {
        Dotenv dotenv = Dotenv.configure()
                .directory("./")
                .ignoreIfMalformed()
                .ignoreIfMissing()
                .load();

        dotenv.entries().forEach(entry -> {
            if (System.getProperty(entry.getKey()) == null) {
                System.setProperty(entry.getKey(), entry.getValue());
            }
        });

        System.out.println("✅ .env 환경 변수가 시스템 프로퍼티에 성공적으로 로드되었습니다.");
    }
}
